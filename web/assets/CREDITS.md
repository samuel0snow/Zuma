# 当前素材来源与许可

本目录仅保留运行资源及现有接口测试使用的兼容资源。2026-10-15 已移除未接入的候选球、备选图标、勋章、独立粒子及特效单帧副本；历史检索记录保留在 `docs/美术资源/`。素材整理脚本用于历史资源复现，执行会重新产生候选文件，不是构建步骤。

## 当前画面

- `balls/gemstone/*.webp`、`launcher/pedestal-painted.webp`、`backgrounds/courtyard.webp`：本项目使用 imagegen 生成并转换为 WebP。提示词与制作流程见 `docs/美术资源/背景生成记录.md`。
- `favicon.svg`：本项目自绘。
- `icons/ui/*.svg`：基于 Lorc 的 back-forth、stopwatch、bright-explosion、laurel-crown、cracked-glass 图标，去除黑底并调整暖金色与画布。Icons made by Lorc, available on https://game-icons.net (CC BY 3.0). Modified for Zuma: transparent background, gold color and fixed canvas size. 许可：https://creativecommons.org/licenses/by/3.0/ 。分发时必须保留署名。
- `effects/{flash-seq,boom-seq,ring-seq}/sheet.png`：rubberduck 的 [25 special effects rendered with blender](https://opengameart.org/content/25-special-effects-rendered-with-blender)，CC0。等距抽帧后横向合成图集，分别 12、12、8 帧，单帧 128×128。网页对普通闪光进行灰度和亮度处理。
- `track/paving-512x128.jpg`：ambientCG [PavingStones070](https://ambientcg.com/view?id=PavingStones070)，CC0。由 Color 贴图缩放并裁切；保留用于轨道资源接口。

## 兼容资源

- `balls/vector/*.svg`：Kenney [Rolling Ball Assets](https://kenney.nl/assets/rolling-ball-assets)，CC0。从原矢量蓝球提取路径，镜像高光并派生五色；许可全文见 `licenses/kenney-rolling-ball.txt`。
- `launcher/pedestal.svg`：本项目自绘的可编辑底座。

兼容资源仍受 HTTP 与发布包测试覆盖，暂时保留。完整候选来源清单见 `docs/美术资源/美术资源候选清单.md`；其中历史路径不代表目前仍随项目分发。
