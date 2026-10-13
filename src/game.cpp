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
    const auto validColor = [](char color) { return std::string("RGBYP").find(color) != std::string::npos; };
    if (!std::all_of(level.active.begin(), level.active.end(), validColor) ||
        !std::all_of(level.feed.begin(), level.feed.end(), validColor) ||
        !std::all_of(ammo_.begin(), ammo_.end(), validColor))
        throw std::invalid_argument("关卡配置含非法颜色");
    if (options.initialAttributes.size() > level.active.size())
        throw std::invalid_argument("初始属性数量超过初始轨道长度");
    for (const auto special : options.initialAttributes)
        if (special != Special::None && special != Special::Back && special != Special::Stop && special != Special::Boom)
            throw std::invalid_argument("未知特殊属性");
    for (std::size_t i = 0; i < level.active.size(); ++i) {
        auto ball = makeBall(level.active[i]);
        if (i < options.initialAttributes.size()) ball.special = options.initialAttributes[i];
        track_.push_back(ball);
    }
    for (char ball : level.feed) feed_.push({ball, Special::None, false, nextBallId_++});
    checkStatus();
}
Ball Game::makeBall(char color) {
    Special special = Special::None;
    if (chancePercent_ && std::uniform_int_distribution<unsigned>(1, 100)(random_) <= chancePercent_)
        special = static_cast<Special>(std::uniform_int_distribution<int>(1, 3)(random_));
    return {color, special, true, nextBallId_++};
}
std::vector<Ball> Game::feedBalls() const {
    auto copy = feed_;
    std::vector<Ball> result;
    while (!copy.empty()) { result.push_back(copy.front()); copy.pop(); }
    return result;
}
GameSnapshot Game::snapshot() const {
    return {trackBalls(), feedBalls(), score_, turns_, stoppedTurns_, currentBall(), nextBall(), status_};
}
void Game::record(const std::string& type, std::vector<std::uint64_t> ids,
                  std::size_t from, std::size_t to, std::size_t scoreDelta) {
    turnEvents_.push_back({type, std::move(ids), from, to, scoreDelta, snapshot()});
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
    turnEvents_.clear();
    auto gap = track_.begin();
    std::advance(gap, position - 1);
    auto inserted = track_.insert(gap, Ball{currentBall(), Special::None, true, nextBallId_++});
    record("insert", {inserted->id}, position, position);
    eliminate(inserted);
    finishTurn();
    return true;
}
bool Game::discard() {
    if (status_ != Status::Playing) return false;
    events_.clear();
    turnEvents_.clear();
    record("discard");
    finishTurn();
    return true;
}
void Game::eliminate(std::list<Ball>::iterator ball) {
    bool chained = false;
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
                        events_.push_back("Boom: 炸弹清除 第" + std::to_string(newStart + 1)
                                          + "格到第" + std::to_string(newEnd) + "格");
                        record("boom", {nodes[i]->id}, newStart + 1, newEnd);
                        break;
                    }
                    case Special::Stop:
                        pendingStop_ += 2;
                        events_.push_back("Stop: 停滞效果生效，增加 2 回合");
                        record("stop_trigger", {nodes[i]->id});
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
        std::vector<std::uint64_t> removed;
        for (auto it = first; it != after; ++it) removed.push_back(it->id);
        auto right = track_.erase(first, after);
        score_ += count * 10;
        record(chained ? "chain_eliminate" : "eliminate", removed, start + 1, end, count * 10);
        if (!hasLeft || right == track_.end() || left->color != right->color) return;
        ball = left; // Only the surviving gap can start a chain reaction.
        chained = true;
    }
}
void Game::finishTurn() {
    while (pendingBack_ > 0) {
        --pendingBack_;
        std::queue<Ball> restored;
        std::size_t count = 0;
        std::vector<std::uint64_t> returned;
        while (!track_.empty() && count < 3) {
            returned.push_back(track_.front().id);
            restored.push(track_.front()); track_.pop_front(); ++count;
        }
        while (!feed_.empty()) { restored.push(feed_.front()); feed_.pop(); }
        feed_.swap(restored);
        events_.push_back("Back: 彩球回退" + std::to_string(count) + "格");
        record("back", returned, count ? 1 : 0, count);
    }
    // A newly triggered Stop starts on the following turn, not this one.
    if (stoppedTurns_ > 0) {
        --stoppedTurns_; events_.push_back("Stop: 本回合停滞中");
        record("stop_skip");
    }
    else if (!feed_.empty()) {
        auto ball = feed_.front(); feed_.pop();
        // Returned balls keep their original attribute; new feed balls roll once.
        if (!ball.attributeAssigned) {
            const auto id = ball.id;
            ball = makeBall(ball.color);
            ball.id = id;
        }
        track_.push_front(ball);
        record("feed", {ball.id}, 1, 1);
    }
    stoppedTurns_ += pendingStop_;
    pendingStop_ = 0;
    ammoIndex_ = (ammoIndex_ + 1) % ammo_.size();
    ++turns_;
    record("ammo_update");
    checkStatus();
    record("turn_end");
    if (status_ != Status::Playing) record(status_ == Status::Won ? "won" : "lost");
}
void Game::checkStatus() {
    if (track_.empty() && feed_.empty()) status_ = Status::Won;
    else if (track_.size() > maxLength_) status_ = Status::Lost;
    else status_ = Status::Playing;
}
}
