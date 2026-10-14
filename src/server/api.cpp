#include "zuma_api.hpp"
#include <chrono>
#include <limits>
#include <set>
#include <stdexcept>

namespace zuma {
namespace {
struct ApiError : std::runtime_error {
    int status;
    std::string code;
    ApiError(int status, std::string code, const std::string& message)
        : std::runtime_error(message), status(status), code(std::move(code)) {}
};
const char* statusName(Status status) {
    return status == Status::Won ? "won" : status == Status::Lost ? "lost" : "playing";
}
Json ballsJson(const std::vector<Ball>& balls) {
    Json result = Json::array();
    for (const auto& ball : balls)
        result.push_back({{"id", std::to_string(ball.id)}, {"color", std::string(1, ball.color)},
                          {"special", specialName(ball.special)}, {"attributeAssigned", ball.attributeAssigned}});
    return result;
}
void fields(const Json& body, const std::set<std::string>& allowed) {
    if (!body.is_object()) throw ApiError(400, "INVALID_BODY", "请求必须是 JSON 对象");
    for (auto it = body.begin(); it != body.end(); ++it)
        if (!allowed.count(it.key())) throw ApiError(400, "UNKNOWN_FIELD", "未知请求字段: " + it.key());
}
std::string stringField(const Json& body, const char* key, std::size_t limit = 128) {
    if (!body.contains(key) || !body[key].is_string()) throw ApiError(400, "INVALID_FIELD", std::string(key) + " 必须是字符串");
    auto value = body[key].get<std::string>();
    if (value.empty() || value.size() > limit) throw ApiError(400, "INVALID_FIELD", std::string(key) + " 长度无效");
    return value;
}
std::uint64_t integerField(const Json& body, const char* key, std::uint64_t max) {
    if (!body.contains(key) || !body[key].is_number_integer())
        throw ApiError(400, "INVALID_FIELD", std::string(key) + " 必须是非负整数");
    if (body[key].is_number_unsigned()) {
        const auto value = body[key].get<std::uint64_t>();
        if (value <= max) return value;
    } else {
        const auto value = body[key].get<std::int64_t>();
        if (value >= 0 && static_cast<std::uint64_t>(value) <= max) return static_cast<std::uint64_t>(value);
    }
    throw ApiError(400, "INVALID_FIELD", std::string(key) + " 超出范围");
}
void resourceCheck(const Level& level) {
    if (level.active.size() > 4096 || level.feed.size() > 4096 || level.ammo.size() > 4096 || level.maxLength > 4096)
        throw ApiError(422, "LEVEL_TOO_LARGE", "GUI 关卡每个字段最多支持 4096 个球或容量");
}
}
Json snapshotJson(const GameSnapshot& snapshot) {
    return {{"track", ballsJson(snapshot.track)}, {"feed", ballsJson(snapshot.feed)},
            {"score", snapshot.score}, {"turns", snapshot.turns}, {"stoppedTurns", snapshot.stoppedTurns},
            {"currentBall", std::string(1, snapshot.currentBall)}, {"nextBall", std::string(1, snapshot.nextBall)},
            {"status", statusName(snapshot.status)}};
}
Json turnEventsJson(const Game& game) {
    Json result = Json::array();
    for (const auto& event : game.turnEvents()) {
        Json ids = Json::array();
        for (auto id : event.ballIds) ids.push_back(std::to_string(id));
        result.push_back({{"type", event.type}, {"ballIds", ids}, {"from", event.from}, {"to", event.to},
                          {"scoreDelta", event.scoreDelta}, {"snapshot", snapshotJson(event.snapshot)}});
    }
    return result;
}
GameApi::GameApi(Loader loader, bool allowTestSeed) : loader_(std::move(loader)), allowTestSeed_(allowTestSeed) {
    instance_ = std::to_string(std::chrono::high_resolution_clock::now().time_since_epoch().count()) + "-" + std::to_string(std::random_device{}());
    sessionId_ = newSession();
}
std::string GameApi::newSession() { return instance_ + "-" + std::to_string(++sessionCounter_); }
Json GameApi::state() const {
    Json result = game_ ? snapshotJson(game_->snapshot()) : Json{{"status", "ready"}, {"track", Json::array()}, {"feed", Json::array()}};
    result["sessionId"] = sessionId_;
    result["version"] = version_;
    result["levelId"] = levelId_;
    result["specialsEnabled"] = specialsEnabled_;
    result["specialChancePercent"] = specialsEnabled_ ? 30 : 0;
    result["seed"] = seed_;
    result["maxLength"] = game_ ? game_->maxLength() : 0;
    result["lastRequestId"] = lastRequestId_;
    return result;
}
ApiResponse GameApi::handle(const std::string& method, const std::string& path, const Json& body) {
    std::lock_guard<std::mutex> lock(mutex_);
    try {
        if (method == "GET" && path == "/api/game") return {200, {{"state", state()}}};
        if (method == "GET" && path == "/api/levels") {
            Json levels = Json::array();
            for (int id : {1, 2}) {
                Json item{{"id", id}, {"title", "关卡 " + std::to_string(id)}};
                try {
                    auto level = loader_(id); resourceCheck(level);
                    Game validate(level);
                    item["available"] = true; item["active"] = level.active;
                    item["feedCount"] = level.feed.size(); item["maxLength"] = level.maxLength;
                } catch (const std::exception& error) { item["available"] = false; item["error"] = error.what(); }
                levels.push_back(item);
            }
            return {200, {{"levels", levels}}};
        }
        if (method != "POST" || (path != "/api/game" && path != "/api/action" && path != "/api/reset"))
            throw ApiError(404, "NOT_FOUND", "接口不存在");
        if (path == "/api/game") fields(body, {"sessionId", "version", "requestId", "levelId", "specialsEnabled", "seed"});
        else if (path == "/api/action") fields(body, {"sessionId", "version", "requestId", "type", "position"});
        else fields(body, {"sessionId", "version", "requestId"});
        const auto requestId = stringField(body, "requestId");
        const auto cached = cache_.find(requestId);
        if (cached != cache_.end()) {
            if (cached->second.path != path || cached->second.request != body)
                throw ApiError(409, "REQUEST_ID_CONFLICT", "同一请求编号不能用于不同操作");
            return cached->second.response;
        }
        if (stringField(body, "sessionId") != sessionId_) throw ApiError(409, "STALE_SESSION", "游戏会话已改变，请重新同步");
        if (integerField(body, "version", 9007199254740991ULL) != version_) throw ApiError(409, "STALE_VERSION", "状态已更新，请重新同步");
        Json events = Json::array(), messages = Json::array();
        if (path == "/api/game") {
            if (game_) throw ApiError(409, "GAME_EXISTS", "请先重启再创建新游戏");
            const auto id = integerField(body, "levelId", 2);
            if (id == 0) throw ApiError(404, "LEVEL_NOT_FOUND", "关卡不存在");
            if (!body.contains("specialsEnabled") || !body["specialsEnabled"].is_boolean())
                throw ApiError(400, "INVALID_FIELD", "specialsEnabled 必须是布尔值");
            unsigned seed = std::random_device{}();
            if (body.contains("seed")) {
                if (!allowTestSeed_) throw ApiError(400, "TEST_ONLY", "指定种子仅在测试模式可用");
                seed = static_cast<unsigned>(integerField(body, "seed", std::numeric_limits<unsigned>::max()));
            }
            const bool specials = body["specialsEnabled"].get<bool>();
            Level level;
            try { level = loader_(static_cast<int>(id)); }
            catch (const std::exception& error) { throw ApiError(422, "LEVEL_LOAD_FAILED", error.what()); }
            resourceCheck(level);
            auto next = std::make_unique<Game>(level, SpecialOptions{specials ? 30U : 0U, seed, {}});
            game_ = std::move(next); levelId_ = static_cast<int>(id); seed_ = seed; specialsEnabled_ = specials;
            sessionId_ = newSession();
        } else if (path == "/api/reset") {
            game_.reset(); levelId_ = 0; seed_ = 0; specialsEnabled_ = false; sessionId_ = newSession();
        } else {
            if (!game_) throw ApiError(409, "NO_GAME", "请先选择关卡");
            if (game_->status() != Status::Playing) throw ApiError(409, "GAME_FINISHED", "游戏已结束，请重启");
            const auto type = stringField(body, "type", 16);
            bool valid = false;
            if (type == "shoot") {
                const auto position = integerField(body, "position", 4097);
                if (position < 1 || position > game_->trackBalls().size() + 1)
                    throw ApiError(400, "INVALID_POSITION", "发射位置越界");
                valid = game_->shoot(static_cast<std::size_t>(position));
            } else if (type == "discard") {
                if (body.contains("position")) throw ApiError(400, "INVALID_FIELD", "丢弃操作不接受 position");
                valid = game_->discard();
            } else throw ApiError(400, "INVALID_ACTION", "仅支持 shoot 或 discard");
            if (!valid) throw ApiError(400, "INVALID_ACTION", "操作无效");
            events = turnEventsJson(*game_);
            messages = game_->events();
        }
        ++version_; lastRequestId_ = requestId;
        ApiResponse response{200, {{"state", state()}, {"events", events}, {"messages", messages}}};
        cache_[requestId] = {body, path, response}; cacheOrder_.push_back(requestId);
        if (cacheOrder_.size() > 64) { cache_.erase(cacheOrder_.front()); cacheOrder_.pop_front(); }
        return response;
    } catch (const ApiError& error) {
        return {error.status, {{"error", {{"code", error.code}, {"message", error.what()}}}}};
    } catch (const std::exception&) {
        return {500, {{"error", {{"code", "INTERNAL_ERROR"}, {"message", "服务处理失败，请重新同步状态"}}}}};
    }
}
}
