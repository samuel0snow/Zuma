#include "zuma.hpp"
#include <iterator>
#include <stdexcept>
#include <algorithm>

namespace zuma {
const char* specialName(Special special) {
    switch (special) {
        case Special::Back: return "Back";
        case Special::Stop: return "Stop";
        case Special::Boom: return "Boom";
        default: return "";
    }
}
Game::Game(const Level& level, SpecialOptions options)
    : ammo_(level.ammo), maxLength_(level.maxLength),
      chancePercent_(options.chancePercent), random_(options.seed) {
    if (ammo_.empty() || maxLength_ == 0 || level.active.size() > maxLength_ || chancePercent_ > 100)
        throw std::invalid_argument("无效关卡配置");
    for (std::size_t i = 0; i < level.active.size(); ++i) {
        auto ball = makeBall(level.active[i]);
        if (i < options.initialAttributes.size()) ball.special = options.initialAttributes[i];
        track_.push_back(ball);
    }
    for (char ball : level.feed) feed_.push({ball, Special::None, false});
    checkStatus();
}
Ball Game::makeBall(char color) {
    Special special = Special::None;
    if (chancePercent_ && std::uniform_int_distribution<unsigned>(1, 100)(random_) <= chancePercent_)
        special = static_cast<Special>(std::uniform_int_distribution<int>(1, 3)(random_));
    return {color, special};
}
std::string Game::track() const {
    std::string result;
    for (const auto& ball : track_) result += ball.color;
    return result;
}
std::string Game::feed() const {
    auto copy = feed_;
    std::string result;
    while (!copy.empty()) { result += copy.front().color; copy.pop(); }
    return result;
}
bool Game::shoot(std::size_t position) {
    if (status_ != Status::Playing || position == 0 || position > track_.size() + 1) return false;
    events_.clear();
    auto gap = track_.begin();
    std::advance(gap, position - 1);
    eliminate(track_.insert(gap, Ball{currentBall(), Special::None}));
    finishTurn();
    return true;
}
bool Game::discard() {
    if (status_ != Status::Playing) return false;
    events_.clear();
    finishTurn();
    return true;
}
void Game::eliminate(std::list<Ball>::iterator ball) {
    while (true) {
        auto first = ball;
        auto after = std::next(ball);
        const char color = ball->color;
        while (first != track_.begin() && std::prev(first)->color == color) --first;
        while (after != track_.end() && after->color == color) ++after;
        auto count = static_cast<std::size_t>(std::distance(first, after));
        if (count < 3) return;
        // Expand the deletion interval for every bomb reached, using the
        // pre-deletion positions. Newly reached bombs can expand it again.
        auto nodes = std::vector<std::list<Ball>::iterator>{};
        for (auto it = track_.begin(); it != track_.end(); ++it) nodes.push_back(it);
        auto start = static_cast<std::size_t>(std::distance(track_.begin(), first));
        auto end = start + count;
        std::vector<bool> handled(nodes.size(), false);
        bool expanded = true;
        while (expanded) {
            expanded = false;
            for (std::size_t i = start; i < end; ++i) {
                if (handled[i]) continue;
                handled[i] = true;
                switch (nodes[i]->special) {
                    case Special::Boom: {
                        const auto newStart = i > 3 ? i - 3 : 0;
                        const auto newEnd = std::min(nodes.size(), i + 4);
                        if (newStart < start) { start = newStart; expanded = true; }
                        if (newEnd > end) { end = newEnd; expanded = true; }
                        events_.push_back("Boom：炸弹清除左右各 3 格，范围内属性也会触发。");
                        break;
                    }
                    case Special::Stop:
                        pendingStop_ += 2;
                        events_.push_back("Stop：接下来两个回合暂停等待球进入。");
                        break;
                    case Special::Back: ++pendingBack_; break;
                    default: break;
                }
            }
        }
        first = nodes[start];
        after = end == nodes.size() ? track_.end() : nodes[end];
        count = end - start;
        const bool hasLeft = first != track_.begin();
        auto left = hasLeft ? std::prev(first) : track_.end();
        auto right = track_.erase(first, after);
        score_ += count * 10;
        if (!hasLeft || right == track_.end() || left->color != right->color) return;
        ball = left; // Only the surviving gap can start a chain reaction.
    }
}
void Game::finishTurn() {
    while (pendingBack_ > 0) {
        --pendingBack_;
        std::queue<Ball> restored;
        std::size_t count = 0;
        while (!track_.empty() && count < 3) {
            restored.push(track_.front()); track_.pop_front(); ++count;
        }
        while (!feed_.empty()) { restored.push(feed_.front()); feed_.pop(); }
        feed_.swap(restored);
        events_.push_back("Back：" + std::to_string(count) + " 个球已按原顺序退回等待区前端。");
    }
    // A newly triggered Stop starts on the following turn, not this one.
    if (stoppedTurns_ > 0) { --stoppedTurns_; events_.push_back("停滞中：本回合不加入等待球。"); }
    else if (!feed_.empty()) {
        auto ball = feed_.front(); feed_.pop();
        // Returned balls keep their original attribute; new feed balls roll once.
        if (!ball.attributeAssigned) ball = makeBall(ball.color);
        track_.push_front(ball);
    }
    stoppedTurns_ += pendingStop_;
    pendingStop_ = 0;
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
