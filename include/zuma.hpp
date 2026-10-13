#pragma once
#include <cstddef>
#include <istream>
#include <list>
#include <queue>
#include <string>
#include <vector>

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
class Game {
public:
    explicit Game(const Level& level);
    bool shoot(std::size_t position);
    bool discard();
    std::string track() const;
    std::string feed() const;
    char currentBall() const { return ammo_[ammoIndex_]; }
    char nextBall() const { return ammo_[(ammoIndex_ + 1) % ammo_.size()]; }
    std::size_t maxLength() const { return maxLength_; }
    std::size_t turns() const { return turns_; }
    std::size_t score() const { return score_; }
    Status status() const { return status_; }
private:
    void eliminate(std::list<char>::iterator ball);
    void finishTurn();
    void checkStatus();
    std::list<char> track_;
    std::queue<char> feed_;
    std::vector<char> ammo_;
    std::size_t maxLength_, ammoIndex_ = 0, turns_ = 0, score_ = 0;
    Status status_ = Status::Playing;
};
}
