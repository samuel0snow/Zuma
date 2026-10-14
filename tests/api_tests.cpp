#include "zuma_api.hpp"
#include <iostream>
#include <set>
#include <stdexcept>

using namespace zuma;
void require(bool condition, const char* message) { if (!condition) throw std::runtime_error(message); }
Json mutation(const Json& state, std::string requestId) {
    return {{"sessionId", state["sessionId"]}, {"version", state["version"]}, {"requestId", requestId}};
}
Level sample(int id) {
    return id == 1 ? Level{"RRBBRR", "GBYPRGBGYRBPYG", {'B','B','G','Y','R','R','G','B','Y','P','R','G'}, 12}
                   : Level{"RGGBBRRY", "YPGYBRPGYRBPGY", {'G','B','R','Y','P'}, 15};
}
int main() {
    try {
        GameApi api(sample, true);
        auto ready = api.handle("GET", "/api/game").body["state"];
        require(ready["status"] == "ready", "initial ready");
        require(api.handle("GET", "/api/levels").body["levels"].size() == 2, "two levels");
        auto start = mutation(ready, "start"); start.update({{"levelId",1},{"specialsEnabled",false},{"seed",42}});
        auto response = api.handle("POST", "/api/game", start);
        require(response.status == 200, "create game");
        require(api.handle("POST", "/api/game", start).body == response.body, "idempotent create");
        auto state = response.body["state"];
        auto invalid = mutation(state, "invalid"); invalid.update({{"type","shoot"},{"position",1.5}});
        require(api.handle("POST", "/api/action", invalid).status == 400, "reject float");
        invalid["position"] = true;
        require(api.handle("POST", "/api/action", invalid).status == 400, "reject boolean");
        invalid["position"] = "1";
        require(api.handle("POST", "/api/action", invalid).status == 400, "reject string");
        invalid["position"] = 99;
        require(api.handle("POST", "/api/action", invalid).status == 400, "reject out of range");
        require(api.handle("GET", "/api/game").body["state"] == state, "invalid state unchanged");
        auto shoot = mutation(state, "shoot"); shoot.update({{"type","shoot"},{"position",4}});
        auto shot = api.handle("POST", "/api/action", shoot);
        require(shot.status == 200 && shot.body["state"]["score"] == 70 && shot.body["state"]["turns"] == 1, "ordinary chain over API");
        require(shot.body["historyEntry"]["turn"] == 1 && shot.body["historyEntry"]["action"] == "shoot", "turn recorded for replay");
        auto history = api.handle("GET", "/api/history");
        require(history.status == 200 && history.body["turns"].size() == 1, "all-round history listed");
        const auto& replay = history.body["turns"][0];
        require(replay["state"]["score"] == shot.body["state"]["score"] &&
                replay["state"]["turns"] == shot.body["state"]["turns"] &&
                replay["state"]["track"] == shot.body["state"]["track"] &&
                replay["state"]["feed"] == shot.body["state"]["feed"], "round recap stores actual end-of-turn snapshot");
        require(replay["events"] == shot.body["events"], "round recap stores structured core event trace");
        require(replay["messages"] == shot.body["messages"], "round recap stores core event messages");
        require(api.handle("POST", "/api/action", shoot).body == shot.body, "idempotent shot");
        auto conflict = shoot; conflict["position"] = 3;
        require(api.handle("POST", "/api/action", conflict).status == 409, "conflicting request ID");
        auto stale = shoot; stale["requestId"] = "stale";
        require(api.handle("POST", "/api/action", stale).status == 409, "reject stale version");
        auto end = mutation(shot.body["state"], "end"); end["type"] = "end";
        auto ended = api.handle("POST", "/api/action", end);
        require(ended.status == 200 && ended.body["state"]["status"] == "ended", "manual end action");
        require(ended.body["state"]["turns"] == 1 && api.handle("GET", "/api/history").body["turns"].size() == 1,
                "manual end preserves completed rounds without adding a turn");
        auto afterEnd = mutation(ended.body["state"], "after-end"); afterEnd["type"] = "discard";
        require(api.handle("POST", "/api/action", afterEnd).status == 409, "ended game locks turn actions");
        auto reset = mutation(ended.body["state"], "reset");
        auto resetResult = api.handle("POST", "/api/reset", reset);
        require(resetResult.status == 200 && resetResult.body["state"]["status"] == "ready", "reset to mode");
        require(api.handle("GET", "/api/history").body["turns"].empty(), "restart clears replay history");
        require(api.handle("POST", "/api/reset", reset).body == resetResult.body, "idempotent reset");
        auto old = mutation(shot.body["state"], "old-session"); old["type"] = "discard";
        require(api.handle("POST", "/api/action", old).status == 409, "old session cannot touch reset");

        // Service states and structured events must exactly equal the CLI core
        // under identical levels, seeds and commands, in both modes and levels.
        for (int id : {1,2}) for (bool special : {false,true}) {
            GameApi service(sample, true);
            auto initial = service.handle("GET", "/api/game").body["state"];
            auto create = mutation(initial, "create"); create.update({{"levelId",id},{"specialsEnabled",special},{"seed",123}});
            auto served = service.handle("POST", "/api/game", create).body["state"];
            Game core(sample(id), {special ? 30U : 0U,123,{}});
            auto compare = [&](const Json& serverState) {
                const auto expected = snapshotJson(core.snapshot());
                for (auto it = expected.begin(); it != expected.end(); ++it)
                    require(serverState[it.key()] == it.value(), "core and API snapshot mismatch");
            };
            compare(served);
            for (int turn = 0; turn < 40 && core.status() == Status::Playing; ++turn) {
                auto cmd = mutation(served, "turn-" + std::to_string(turn));
                if (turn % 3 == 0) { cmd["type"] = "discard"; core.discard(); }
                else {
                    const std::size_t position = turn == 1 && id == 1 ? 4 : core.trackBalls().size() + 1;
                    cmd.update({{"type","shoot"},{"position",position}}); core.shoot(position);
                }
                auto result = service.handle("POST", "/api/action", cmd);
                require(result.status == 200, "service valid turn");
                served = result.body["state"]; compare(served);
                require(result.body["events"] == turnEventsJson(core), "core and API events mismatch");
            }
            if (core.status() != Status::Playing) {
                auto command = mutation(served, "ended"); command["type"] = "discard";
                require(service.handle("POST", "/api/action", command).status == 409, "finished game locked");
            }
        }
        Game withBack({"GBYRR", "P", {'R'}, 12}, {0,0,{Special::Stop,Special::None,Special::None,Special::Back}});
        const auto original = withBack.trackBalls(); const auto waiting = withBack.feedBalls();
        withBack.shoot(6);
        require(withBack.trackBalls()[0].id == original[0].id && withBack.feedBalls()[0].id == original[1].id, "Back/feed identity retained");
        require(withBack.feedBalls().back().id == waiting[0].id, "waiting ball identity retained");
        std::set<std::uint64_t> ids;
        for (const auto& ball : withBack.trackBalls()) require(ids.insert(ball.id).second, "unique track IDs");
        for (const auto& ball : withBack.feedBalls()) require(ids.insert(ball.id).second, "unique feed IDs");
        require(withBack.turnEvents().back().snapshot.turns == withBack.turns(), "final event snapshot");
        Game normal({"RRBBRR", "G", {'B'}, 12}); normal.shoot(4);
        auto trace = normal.turnEvents();
        require(trace[0].type == "insert" && trace[1].type == "eliminate" && trace[2].type == "chain_eliminate" && trace[3].type == "feed", "phase order");
        require(trace[1].scoreDelta == 30 && trace[2].scoreDelta == 40, "phase scores");
        const auto preserved = turnEventsJson(normal);
        require(!normal.shoot(9) && turnEventsJson(normal) == preserved, "invalid keeps trace");
        GameApi victory([](int) { return Level{"RR", "", {'R'}, 2}; }, true);
        auto winStart = mutation(victory.handle("GET", "/api/game").body["state"], "win-start"); winStart.update({{"levelId",1},{"specialsEnabled",false}});
        auto winState = victory.handle("POST", "/api/game", winStart).body["state"];
        auto winShot = mutation(winState, "win"); winShot.update({{"type","shoot"},{"position",2}});
        require(victory.handle("POST", "/api/action", winShot).body["state"]["status"] == "won", "API victory");
        GameApi missing([](int)->Level { throw std::runtime_error("missing"); });
        require(missing.handle("GET", "/api/levels").body["levels"][0]["available"] == false, "missing listed safely");
        auto missingStart = mutation(missing.handle("GET", "/api/game").body["state"], "missing"); missingStart.update({{"levelId",1},{"specialsEnabled",false}});
        require(missing.handle("POST", "/api/game", missingStart).status == 422 && missing.handle("GET", "/api/game").body["state"]["status"] == "ready", "missing create no mutation");
        std::cout << "API, identity, events and core consistency checks passed.\n";
    } catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
}
