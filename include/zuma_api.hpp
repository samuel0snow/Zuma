#pragma once
#include "zuma.hpp"
#include "zuma_maps.hpp"
#include "json.hpp"
#include <functional>
#include <map>
#include <memory>
#include <mutex>
#include <deque>

namespace zuma {
using Json = nlohmann::json;
struct ApiResponse { int status; Json body; };
class GameApi {
public:
    using Loader = std::function<Level(int)>;
    using Catalog = std::function<std::vector<int>()>;
    explicit GameApi(Loader loader, bool allowTestSeed = false, Catalog catalog = []{return std::vector<int>{1,2};});
    ApiResponse handle(const std::string& method, const std::string& path, const Json& body = Json::object());
private:
    Json state() const;
    std::string newSession();
    Loader loader_;
    Catalog catalog_;
    bool allowTestSeed_, specialsEnabled_ = false;
    int levelId_ = 0;
    std::uint64_t version_ = 0, sessionCounter_ = 0;
    unsigned seed_ = 0;
    std::string mapId_ = "straight";
    std::string instance_, sessionId_, lastRequestId_;
    std::unique_ptr<Game> game_;
    Json history_ = Json::array();
    std::mutex mutex_;
    struct Cached { Json request; std::string path; ApiResponse response; };
    std::map<std::string, Cached> cache_;
    std::deque<std::string> cacheOrder_;
};
Json snapshotJson(const GameSnapshot& snapshot);
Json turnEventsJson(const Game& game);
}
