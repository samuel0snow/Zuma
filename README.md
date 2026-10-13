# Zuma CLI

基于 `Zuma 实现方式.md` 和 `Zuma/Zuma.md` 的 C++17 命令行祖玛游戏。原始两个关卡保留在 `Zuma/`，无需第三方库。

## 编译与运行

需要支持 C++17 的编译器（MinGW GCC、Clang 或 MSVC）和 CMake 3.16+。在项目根目录执行：

```powershell
cmake -S . -B build -G "MinGW Makefiles"
cmake --build build
.\build\zuma.exe
ctest --test-dir build --output-on-failure
```

Visual Studio 开发者终端可以使用：

```powershell
cmake -S . -B build
cmake --build build --config Release
.\build\Release\zuma.exe --levels .\build\levels
ctest --test-dir build -C Release --output-on-failure
```

不使用 CMake 时，也可以在根目录直接编译：

```powershell
g++ -std=c++17 -Wall -Wextra -Wpedantic -static -I include src/main.cpp src/game.cpp src/level.cpp -o zuma.exe
.\zuma.exe
```

Linux/macOS 使用相同源码：`cmake -S . -B build`、`cmake --build build`、`./build/zuma`。程序优先查找可执行文件旁的 `levels/`，再查找工作目录下的 `Zuma/` 和 `levels/`；可用 `--levels 路径` 指定关卡目录。打包时将可执行文件与包含两个关卡的 `levels/` 文件夹一起分发。

## 操作与规则

- 启动输入 `1` 或 `2` 选择关卡。
- 输入 `1…n+1` 发射，位置表示原第 i 个球之前，`n+1` 表示末尾；空轨道只有位置 `1`。
- `q` 丢弃当前球；`exit` 主动退出，不计回合、不算失败。输入结束也会退出。
- 空输入、非整数、数字后附带字符和越界位置均报错，全部状态保持不变。
- 有效回合依次执行：插入或丢弃 → 普通及全部连锁消除 → 一个等待球从轨道最前端进入 → 循环弹药前移并增加回合数 → 判断胜负。
- 连续至少三个同色球整段消除，每球 10 分。仅检查插入球及消除断口；丢弃和等待球进入不触发消除。
- 轨道与等待区同时为空则胜利；轨道长度超过上限则失败。等于上限仍可发射，完成整个回合才判断。
- 结束后输入 `r` 返回选择关卡，创建全新状态，或输入 `exit` 退出。

实现文档最后的鲁棒性条目与前面的严格位置校验冲突：初期采用前文规定，超出 `n+1` 一律报错，不自动转换为末尾位置。彩球保留字母表示，不依赖终端 ANSI 颜色支持。

## 模块与数据结构

| 模块/结构 | 用途与原因 |
| --- | --- |
| `src/level.cpp` | 按行解析字段；验证缺失、重复、未知字段、颜色、正整数和初始长度；支持 CRLF、空白行及 UTF-8 BOM。 |
| `src/game.cpp` / `include/zuma.hpp` | 独立规则核心，不依赖 CLI 输入输出，可由后续 GUI 调用。 |
| `src/main.cpp` | 关卡选择、严格命令解析、状态显示、错误提示及重新选择。 |
| `vector<char>` | 循环弹药，用下标和取模访问当前球、下一球。 |
| `list<char>` | 轨道，支持插入、向左右扩展及区间删除；位置定位需要遍历。删除时只保留仍有效的断口迭代器。 |
| `queue<char>` | 等待区，按先进先出顺序每有效回合取一个球。 |

## 验证与演示

`tests/tests.cpp` 覆盖普通消除、多级连锁、断口不足三个、丢弃与自动增长不消除、弹药循环、非法操作不改变状态、空轨道、满轨道发射、胜负及关卡格式错误。

原始关卡 1 首回合输入 `4`：消除三个 B 和四个 R，得分 70，随后等待区的 G 入轨，回合数 1，游戏继续。输入 `q` 演示自动增长及弹药更新。连续输入空行、`abc`、`2x`、`0` 和越界数演示无效输入。

可将临时演示目录中的 `level1.txt` 写为 `ACTIVE=RR`、`FEED=`、`AMMO=R`、`MAX_LENGTH=2`（每字段一行），用 `--levels` 指向该目录；输入 `2` 即普通消除并胜利。原始附件无需修改。课堂报告与截图 PDF 不属于本次 CLI 搭建产物。
