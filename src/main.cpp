#include "zuma.hpp"
#include <fstream>
#include <iostream>
#ifdef _WIN32
#include <windows.h>
#endif

void display(const zuma::Game& game, int level) {
    const auto track = game.track();
    const auto feed = game.feed();
    // Keep every label's first digit directly above its insertion boundary.
    const auto digits = std::to_string(track.size() + 1).size();
    const std::size_t cellWidth = digits + 1 > 4 ? digits + 1 : 4;
    std::cout << "--------------------------------------------------------------------\n\n\n"
              << "--------------------------------------------------------------------\n"
              << "关卡: " << level << "    得分: " << game.score() << "    回合数: " << game.turns()
              << "\n轨道长度: " << track.size() << " / " << game.maxLength()
              << "\n\n插入位置（对应下方竖线）:\n\n  ";
    for (std::size_t i = 1; i <= track.size() + 1; ++i) {
        const auto label = std::to_string(i);
        std::cout << label << std::string(cellWidth - label.size(), ' ');
    }
    std::cout << "\n  |";
    const auto slots = track.size() > game.maxLength() ? track.size() : game.maxLength();
    for (std::size_t i = 0; i < slots; ++i) {
        std::cout << ' ' << (i < track.size() ? track[i] : ' ')
                  << std::string(cellWidth - 3, ' ') << '|';
    }
    std::cout << "\n\n当前球 | " << game.currentBall() << " |    下一球 | " << game.nextBall()
              << " |\n\n等待区: " << (feed.empty() ? "（空）" : feed)
              << "（剩余 " << feed.size() << " 个）\n\n";
}
int main(int argc, char** argv) {
#ifdef _WIN32
    SetConsoleOutputCP(CP_UTF8);
    SetConsoleCP(CP_UTF8);
#endif
    std::string directory;
    if (argc == 3 && std::string(argv[1]) == "--levels") directory = argv[2];
    else if (argc != 1) {
        std::cerr << "用法: zuma [--levels 关卡目录]\n";
        return 1;
    } else {
        const std::string executable = argv[0];
        const auto separator = executable.find_last_of("/\\");
        const auto executableDir = separator == std::string::npos ? std::string(".") : executable.substr(0, separator);
        for (const auto& candidate : {executableDir + "/levels", std::string("Zuma"), std::string("levels")}) {
            if (std::ifstream(candidate + "/level1.txt")) { directory = candidate; break; }
        }
        if (directory.empty()) directory = "Zuma";
    }
    std::cout << "祖玛 CLI — R红 G绿 B蓝 Y黄 P紫\n";
    std::string command;
    while (true) {
        std::cout << "\n关卡列表:\n1. level1.txt\n2. level2.txt\n输入关卡编号，或 exit 退出: " << std::flush;
        if (!std::getline(std::cin, command)) break;
        command = zuma::trim(command);
        if (command.compare(0, 3, "\xEF\xBB\xBF") == 0) command = zuma::trim(command.substr(3));
        if (command == "exit") break;
        std::size_t selection = 0;
        if (!zuma::parsePositive(command, selection) || selection > 2) {
            std::cout << "无效关卡编号，请输入 1 或 2。\n"; continue;
        }
        try {
            zuma::Game game(zuma::loadLevel(directory + "/level" + std::to_string(selection) + ".txt"));
            display(game, static_cast<int>(selection));
            while (game.status() == zuma::Status::Playing) {
                std::cout << "输入位置发射，输入 q 丢弃，输入 exit 退出: " << std::flush;
                if (!std::getline(std::cin, command)) return 0;
                command = zuma::trim(command);
                if (command == "exit") { std::cout << "已主动退出。\n"; return 0; }
                std::size_t position = 0;
                const auto before = game.score();
                bool valid = command == "q" ? game.discard()
                    : zuma::parsePositive(command, position) && game.shoot(position);
                if (!valid) { std::cout << "无效操作：请输入 1 至 " << game.track().size() + 1 << " 的整数、q 或 exit。\n"; continue; }
                if (game.score() > before) std::cout << "消除 " << (game.score() - before) / 10 << " 个球，获得 " << game.score() - before << " 分。\n";
                display(game, static_cast<int>(selection));
            }
            std::cout << (game.status() == zuma::Status::Won ? "胜利！" : "失败：轨道超过上限。")
                      << " 最终得分: " << game.score() << "，回合数: " << game.turns() << '\n';
            while (true) {
                std::cout << "输入 r 重新选择关卡，或 exit 退出: " << std::flush;
                if (!std::getline(std::cin, command)) return 0;
                command = zuma::trim(command);
                if (command == "exit") return 0;
                if (command == "r") break;
                std::cout << "请输入 r 或 exit。\n";
            }
        } catch (const std::exception& error) { std::cout << "关卡读取失败: " << error.what() << '\n'; }
    }
    return 0;
}
