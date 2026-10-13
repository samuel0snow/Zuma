#include "zuma.hpp"
#include <iostream>
#include <sstream>
#include <stdexcept>

void require(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}
zuma::Level level(std::string active, std::string feed, std::string ammo, std::size_t limit = 12) {
    return {active, feed, {ammo.begin(), ammo.end()}, limit};
}
void invalid(const std::string& source) {
    std::istringstream stream(source);
    bool rejected = false;
    try { zuma::readLevel(stream); } catch (const std::runtime_error&) { rejected = true; }
    require(rejected, "invalid level accepted");
}
int main() {
    try {
        bool missingRejected = false;
        try { zuma::loadLevel("__zuma_missing_directory__/level.txt"); }
        catch (const std::runtime_error& error) {
            missingRejected = std::string(error.what()).find("无法打开关卡文件") != std::string::npos;
        }
        require(missingRejected, "missing file must report open failure");
        const auto rejectConfig = [](zuma::Level config, zuma::SpecialOptions options = {}) {
            bool rejected = false;
            try { zuma::Game game(config, options); } catch (const std::invalid_argument&) { rejected = true; }
            require(rejected, "core accepted invalid configuration");
        };
        rejectConfig(level("X", "", "R"));
        rejectConfig(level("R", "X", "R"));
        rejectConfig(level("R", "", "X"));
        rejectConfig(level("R", "", ""));
        rejectConfig(level("R", "", "R", 0));
        rejectConfig(level("RR", "", "R", 1));
        rejectConfig(level("R", "", "R"), {101, 0, {}});
        rejectConfig(level("R", "", "R"), {0, 0, {zuma::Special::None, zuma::Special::Back}});
        rejectConfig(level("R", "", "R"), {0, 0, {static_cast<zuma::Special>(99)}});
        using zuma::Special;
        zuma::SpecialOptions stopOptions{0, 0, {Special::Stop, Special::None}};
        zuma::Game stopped(level("RR", "GBYP", "R"), stopOptions);
        require(stopped.shoot(2) && stopped.track() == "G" && stopped.feed() == "BYP" && stopped.stoppedTurns() == 2, "stop trigger turn grows");
        require(!stopped.shoot(9) && stopped.stoppedTurns() == 2, "invalid does not consume pause");
        require(stopped.discard() && stopped.track() == "G" && stopped.stoppedTurns() == 1, "stop first future turn");
        require(stopped.events().back() == "Stop: 本回合停滞中", "short stop event");
        require(stopped.discard() && stopped.track() == "G" && stopped.stoppedTurns() == 0, "stop second future turn");
        require(stopped.discard() && stopped.track() == "BG", "growth resumes");
        zuma::Game backed(level("GBYRR", "P", "R"), {0, 0, {Special::Boom, Special::None, Special::None, Special::Back}});
        require(backed.shoot(6) && backed.track() == "G" && backed.feed() == "BYP" && backed.score() == 30, "back restores order before feed growth");
        require(backed.events().back() == "Back: 彩球回退3格", "short back event");
        require(backed.trackBalls()[0].special == Special::Boom, "returned ball retains attribute");
        zuma::Game bomb(level("GBYRRPG", "", "R"), {0, 0, {Special::None, Special::None, Special::None, Special::Boom}});
        require(bomb.shoot(5) && bomb.track() == "G" && bomb.score() == 70, "boom radius at pre-deletion position");
        require(bomb.events().front() == "Boom: 炸弹清除 第1格到第7格", "boom actual range event");
        zuma::Game bombChain(level("RRBGYPBG", "", "R"), {0, 0, {Special::None, Special::Boom, Special::None, Special::Boom, Special::Stop}});
        require(bombChain.shoot(2) && bombChain.track() == "G" && bombChain.score() == 80 && bombChain.stoppedTurns() == 2, "boom reaches another bomb and stop");
        zuma::Game smallBack(level("GRR", "", "R"), {0, 0, {Special::None, Special::Back}});
        require(smallBack.shoot(4) && smallBack.track() == "G" && smallBack.feed().empty(), "back fewer than three");
        zuma::Game randomA(level("RGBYP", "RGB", "R"), {100, 123, {}});
        zuma::Game randomB(level("RGBYP", "RGB", "R"), {100, 123, {}});
        for (std::size_t i = 0; i < 5; ++i)
            require(randomA.trackBalls()[i].special != Special::None && randomA.trackBalls()[i].special == randomB.trackBalls()[i].special, "seeded random attributes");
        zuma::Game normal(level("RR", "", "R"));
        require(normal.shoot(2) && normal.track().empty() && normal.score() == 30 && normal.status() == zuma::Status::Won, "normal elimination");
        require(!normal.discard() && !normal.shoot(1) && normal.turns() == 1, "finished game mutation");
        zuma::Game chain(level("RRBBRR", "G", "BG"));
        require(chain.shoot(4) && chain.track() == "G" && chain.score() == 70 && chain.turns() == 1 && chain.currentBall() == 'G' && chain.status() == zuma::Status::Playing, "chain then feed");
        zuma::Game multi(level("GGRRBBRRG", "", "B"));
        require(multi.shoot(6) && multi.track().empty() && multi.score() == 100, "three elimination stages");
        zuma::Game shortGap(level("RBBR", "", "B"));
        require(shortGap.shoot(3) && shortGap.track() == "RR" && shortGap.score() == 30, "short gap must stay");
        zuma::Game discard(level("RR", "RGB", "BG", 5));
        require(!discard.shoot(0) && !discard.shoot(4) && discard.track() == "RR" && discard.feed() == "RGB" && discard.turns() == 0 && discard.currentBall() == 'B', "invalid mutation");
        require(discard.discard() && discard.track() == "RRR" && discard.score() == 0 && discard.feed() == "GB" && discard.currentBall() == 'G', "discard no elimination");
        require(discard.discard() && discard.track() == "GRRR" && discard.currentBall() == 'B', "ammo cycle");
        require(discard.discard() && discard.track() == "BGRRR" && discard.status() == zuma::Status::Playing, "equal limit");
        require(discard.shoot(6) && discard.status() == zuma::Status::Lost, "overflow loss");
        zuma::Game full(level("RR", "", "R", 2));
        require(full.shoot(3) && full.status() == zuma::Status::Won, "full track can shoot");
        zuma::Game empty(level("", "", "P"));
        require(empty.status() == zuma::Status::Won && empty.turns() == 0 && empty.nextBall() == 'P', "initial victory and single ammo");
        zuma::Game endpoints(level("G", "P", "BR"));
        require(endpoints.shoot(1) && endpoints.track() == "PBG", "front insertion");
        require(endpoints.shoot(4) && endpoints.track() == "PBGR", "end insertion");
        zuma::Game emptyTrack(level("", "R", "G"));
        require(emptyTrack.shoot(1) && emptyTrack.track() == "RG", "empty insertion");
        std::size_t parsed = 99;
        for (auto input : {"", "0", "-1", "+1", "1x", "1 2", "999999999999999999999999999999999"})
            require(!zuma::parsePositive(input, parsed) && parsed == 99, "strict integer parsing");
        std::istringstream valid("\xEF\xBB\xBF ACTIVE = RR\r\nFEED=\r\nAMMO=R\r\nMAX_LENGTH=2\r\n");
        require(zuma::readLevel(valid).active == "RR", "whitespace and BOM");
        const std::string base = "ACTIVE=\nFEED=\nAMMO=R\nMAX_LENGTH=2\n";
        invalid(base + "ACTIVE=R\n");
        invalid(base + "OTHER=1\n");
        invalid("ACTIVE=\nFEED=\nAMMO=R\n");
        invalid("ACTIVE=X\nFEED=\nAMMO=R\nMAX_LENGTH=2\n");
        invalid("ACTIVE=\nFEED=\nAMMO=\nMAX_LENGTH=2\n");
        invalid("ACTIVE=RRR\nFEED=\nAMMO=R\nMAX_LENGTH=2\n");
        invalid("ACTIVE=\nFEED=\nAMMO=R\nMAX_LENGTH=-1\n");
        invalid("ACTIVE==R\nFEED=\nAMMO=R\nMAX_LENGTH=2\n");
        std::cout << "All rule and parser checks passed.\n";
    } catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
}
