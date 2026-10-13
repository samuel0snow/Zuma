#pragma once
#include <cstddef>
#include <istream>
#include <list>
#include <queue>
#include <string>
#include <vector>
#include <random>
#include <cstdint>

namespace zuma {
struct Level {
    std::string active, feed;
    std::vector<char> ammo;
    std::size_t maxLength = 0;
};
Level readLevel(std::istream& input);
Level loadLevel(const std::string& path);
std::string trim(const std::string& value);
bool parsePositive(const std::string& value, std::size_t& result);
enum class Status { Playing, Won, Lost };
enum class Special { None, Back, Stop, Boom };
struct Ball {
    char color;
    Special special = Special::None;
    bool attributeAssigned = true;
    std::uint64_t id = 0;
};
struct GameSnapshot {
    std::vector<Ball> track, feed;
    std::size_t score, turns, stoppedTurns;
    char currentBall, nextBall;
    Status status;
};
struct TurnEvent {
    std::string type;
    std::vector<std::uint64_t> ballIds;
    std::size_t from = 0, to = 0, scoreDelta = 0;
    GameSnapshot snapshot;
};
const char* specialName(Special special);
struct SpecialOptions {
    unsigned chancePercent = 0;
    unsigned seed = 0;
    std::vector<Special> initialAttributes;
};
class Game {
public:
    explicit Game(const Level& level, SpecialOptions options = {});
    bool shoot(std::size_t position);
    bool discard();
    std::string track() const;
    std::string feed() const;
    std::vector<Ball> trackBalls() const { return {track_.begin(), track_.end()}; }
    const std::vector<std::string>& events() const { return events_; }
    const std::vector<TurnEvent>& turnEvents() const { return turnEvents_; }
    GameSnapshot snapshot() const;
    std::vector<Ball> feedBalls() const;
    std::size_t stoppedTurns() const { return stoppedTurns_; }
    char currentBall() const { return ammo_[ammoIndex_]; }
    char nextBall() const { return ammo_[(ammoIndex_ + 1) % ammo_.size()]; }
    std::size_t maxLength() const { return maxLength_; }
    std::size_t turns() const { return turns_; }
    std::size_t score() const { return score_; }
    Status status() const { return status_; }
private:
    void eliminate(std::list<Ball>::iterator ball);
    Ball makeBall(char color);
    void record(const std::string& type, std::vector<std::uint64_t> ids = {},
                std::size_t from = 0, std::size_t to = 0, std::size_t scoreDelta = 0);
    void finishTurn();
    void checkStatus();
    std::list<Ball> track_;
    std::queue<Ball> feed_;
    std::vector<char> ammo_;
    std::size_t maxLength_, ammoIndex_ = 0, turns_ = 0, score_ = 0;
    Status status_ = Status::Playing;
    unsigned chancePercent_;
    std::mt19937 random_;
    std::size_t stoppedTurns_ = 0, pendingBack_ = 0, pendingStop_ = 0;
    std::vector<std::string> events_;
    std::vector<TurnEvent> turnEvents_;
    std::uint64_t nextBallId_ = 1;
};
}
