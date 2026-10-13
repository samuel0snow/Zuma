#include "zuma.hpp"
#include <iterator>
#include <stdexcept>

namespace zuma {
Game::Game(const Level& level)
    : track_(level.active.begin(), level.active.end()), ammo_(level.ammo), maxLength_(level.maxLength) {
    if (ammo_.empty() || maxLength_ == 0 || track_.size() > maxLength_)
        throw std::invalid_argument("无效关卡配置");
    for (char ball : level.feed) feed_.push(ball);
    checkStatus();
}
std::string Game::track() const { return {track_.begin(), track_.end()}; }
std::string Game::feed() const {
    auto copy = feed_;
    std::string result;
    while (!copy.empty()) { result += copy.front(); copy.pop(); }
    return result;
}
bool Game::shoot(std::size_t position) {
    if (status_ != Status::Playing || position == 0 || position > track_.size() + 1) return false;
    auto gap = track_.begin();
    std::advance(gap, position - 1);
    eliminate(track_.insert(gap, currentBall()));
    finishTurn();
    return true;
}
bool Game::discard() {
    if (status_ != Status::Playing) return false;
    finishTurn();
    return true;
}
void Game::eliminate(std::list<char>::iterator ball) {
    while (true) {
        auto first = ball;
        auto after = std::next(ball);
        const char color = *ball;
        while (first != track_.begin() && *std::prev(first) == color) --first;
        while (after != track_.end() && *after == color) ++after;
        auto count = static_cast<std::size_t>(std::distance(first, after));
        if (count < 3) return;
        const bool hasLeft = first != track_.begin();
        auto left = hasLeft ? std::prev(first) : track_.end();
        auto right = track_.erase(first, after);
        score_ += count * 10;
        if (!hasLeft || right == track_.end() || *left != *right) return;
        ball = left; // Only the surviving gap can start a chain reaction.
    }
}
void Game::finishTurn() {
    if (!feed_.empty()) { track_.push_front(feed_.front()); feed_.pop(); }
    ammoIndex_ = (ammoIndex_ + 1) % ammo_.size();
    ++turns_;
    checkStatus();
}
void Game::checkStatus() {
    if (track_.empty() && feed_.empty()) status_ = Status::Won;
    else if (track_.size() > maxLength_) status_ = Status::Lost;
    else status_ = Status::Playing;
}
}
