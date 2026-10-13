#include "zuma.hpp"
#include <fstream>
#include <iostream>
#include <cstdlib>
#include <chrono>
#ifdef _WIN32
#include <windows.h>
#else
#include <unistd.h>
#endif

bool colorEnabled = false;
bool enableColor() {
    if (std::getenv("NO_COLOR")) return false;
#ifdef _WIN32
    const auto output = GetStdHandle(STD_OUTPUT_HANDLE);
    DWORD mode = 0;
    return GetConsoleMode(output, &mode) &&
           SetConsoleMode(output, mode | ENABLE_VIRTUAL_TERMINAL_PROCESSING);
#else
    const auto* term = std::getenv("TERM");
    return isatty(STDOUT_FILENO) && term && std::string(term) != "dumb";
#endif
}
void printBall(char ball) {
    const char* color = "";
    switch (ball) {
        case 'R': color = "\033[91m"; break;
        case 'G': color = "\033[92m"; break;
        case 'B': color = "\033[94m"; break;
        case 'Y': color = "\033[93m"; break;
        case 'P': color = "\033[95m"; break;
    }
    if (colorEnabled && *color) std::cout << color << ball << "\033[0m";
    else std::cout << ball;
}
void displayResult(const zuma::Game& game) {
    const bool won = game.status() == zuma::Status::Won;
    std::cout << "\n\n";
    if (colorEnabled) std::cout << (won ? "\033[1;92m" : "\033[1;91m");
    std::cout << "  ==================================================\n\n"
              << (won ? "                    胜 利！\n" : "                    失 败！\n")
              << (won ? "             轨道和等待区已全部清空\n" : "               轨道长度超过上限\n")
              << "\n      最终得分: " << game.score() << "    回合数: " << game.turns()
              << "\n\n  ==================================================";
    if (colorEnabled) std::cout << "\033[0m";
    std::cout << "\n\n";
}
void display(const zuma::Game& game, int level) {
    const auto track = game.track();
    const auto feed = game.feed();
    // Keep every label's first digit directly above its insertion boundary.
    const auto digits = std::to_string(track.size() + 1).size();
    const std::size_t cellWidth = digits + 1 > 6 ? digits + 1 : 6;
    std::cout << "\n\n--------------------  ";
    if (game.turns() == 0) std::cout << "初始状态";
    else std::cout << "第 " << game.turns() << " 回合结束";
    std::cout << "  --------------------\n\n"
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
        std::cout << std::string((cellWidth - 2) / 2, ' ');
        printBall(i < track.size() ? track[i] : ' ');
        std::cout << std::string(cellWidth - 2 - (cellWidth - 2) / 2, ' ') << '|';
    }
    std::cout << "\n   ";
    for (const auto& ball : game.trackBalls()) {
        const std::string name = zuma::specialName(ball.special);
        const auto padding = (cellWidth - 1 - name.size()) / 2;
        std::cout << std::string(padding, ' ') << name << std::string(cellWidth - padding - name.size(), ' ');
    }
    if (game.stoppedTurns()) std::cout << "\n\n停滞剩余: " << game.stoppedTurns() << " 回合";
    std::cout << "\n\n当前球 | ";
    printBall(game.currentBall());
    std::cout << " |    下一球 | ";
    printBall(game.nextBall());
    std::cout << " |\n\n等待区: ";
    if (feed.empty()) std::cout << "（空）";
    else for (char ball : feed) printBall(ball);
    std::cout << "（剩余 " << feed.size() << " 个）\n\n";
}
int main(int argc, char** argv) {
#ifdef _WIN32
    SetConsoleOutputCP(CP_UTF8);
    SetConsoleCP(CP_UTF8);
#endif
    colorEnabled = enableColor();
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
            zuma::SpecialOptions options;
            options.chancePercent = 20;
            options.seed = static_cast<unsigned>(std::chrono::high_resolution_clock::now().time_since_epoch().count());
            zuma::Game game(zuma::loadLevel(directory + "/level" + std::to_string(selection) + ".txt"), options);
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
                for (const auto& event : game.events()) std::cout << event << '\n';
                display(game, static_cast<int>(selection));
            }
            displayResult(game);
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
