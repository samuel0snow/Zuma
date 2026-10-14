#include "zuma.hpp"
#include <charconv>
#include <fstream>
#include <filesystem>
#include <algorithm>
#include <limits>
#include <map>
#include <stdexcept>

namespace zuma {
std::string trim(const std::string& value) {
    const auto first = value.find_first_not_of(" \t\r\n");
    if (first == std::string::npos) return {};
    return value.substr(first, value.find_last_not_of(" \t\r\n") - first + 1);
}
bool parsePositive(const std::string& value, std::size_t& result) {
    if (value.empty()) return false;
    std::size_t parsed = 0;
    auto conversion = std::from_chars(value.data(), value.data() + value.size(), parsed);
    if (conversion.ec != std::errc{} || conversion.ptr != value.data() + value.size() || parsed == 0)
        return false;
    result = parsed;
    return true;
}
Level readLevel(std::istream& input) {
    std::map<std::string, std::string> fields;
    std::string line;
    std::size_t number = 0;
    while (std::getline(input, line)) {
        ++number;
        if (number == 1 && line.compare(0, 3, "\xEF\xBB\xBF") == 0) line.erase(0, 3);
        line = trim(line);
        if (line.empty()) continue;
        auto equal = line.find('=');
        if (equal == std::string::npos || line.find('=', equal + 1) != std::string::npos)
            throw std::runtime_error("第 " + std::to_string(number) + " 行应为 字段=值");
        auto key = trim(line.substr(0, equal));
        if (key != "ACTIVE" && key != "FEED" && key != "AMMO" && key != "MAX_LENGTH")
            throw std::runtime_error("未知字段: " + key);
        if (!fields.emplace(key, trim(line.substr(equal + 1))).second)
            throw std::runtime_error("重复字段: " + key);
    }
    if (input.bad()) throw std::runtime_error("读取关卡失败");
    for (const auto* key : {"ACTIVE", "FEED", "AMMO", "MAX_LENGTH"})
        if (!fields.count(key)) throw std::runtime_error(std::string("缺少字段: ") + key);
    for (const auto* key : {"ACTIVE", "FEED", "AMMO"})
        if (fields[key].find_first_not_of("RGBYP") != std::string::npos)
            throw std::runtime_error(std::string(key) + " 含非法颜色（仅允许 R/G/B/Y/P）");
    Level level;
    level.active = fields["ACTIVE"];
    level.feed = fields["FEED"];
    level.ammo.assign(fields["AMMO"].begin(), fields["AMMO"].end());
    if (level.ammo.empty()) throw std::runtime_error("AMMO 不可为空");
    if (!parsePositive(fields["MAX_LENGTH"], level.maxLength))
        throw std::runtime_error("MAX_LENGTH 必须为正整数");
    if (level.active.size() > level.maxLength) throw std::runtime_error("ACTIVE 长度超过 MAX_LENGTH");
    return level;
}
Level loadLevel(const std::string& path) {
    std::ifstream file(path);
    if (!file.is_open()) throw std::runtime_error("无法打开关卡文件: " + path);
    return readLevel(file);
}
std::vector<int> discoverLevels(const std::string& directory) {
    std::vector<int> result;
    std::error_code error;
    std::filesystem::directory_iterator files(directory,error);
    if(error) throw std::runtime_error("无法读取关卡目录: "+directory);
    for(const auto& file:files) {
        if(!file.is_regular_file())continue;
        const auto name=file.path().filename().string();
        if(name.size()<10||name.compare(0,5,"level")!=0||name.substr(name.size()-4)!=".txt")continue;
        const auto digits=name.substr(5,name.size()-9);
        std::size_t id=0;
        if(!parsePositive(digits,id)||id>static_cast<std::size_t>(std::numeric_limits<int>::max())||digits!=std::to_string(id))continue;
        result.push_back(static_cast<int>(id));
    }
    std::sort(result.begin(),result.end());
    return result;
}
}
