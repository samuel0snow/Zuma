# web/assets 素材来源与许可

本目录包含 D 阶段已接入资源及保留的候选资源。页面实际使用 `balls/vector/`、`icons/ui/`、石砖轨道、三类特效图集、自绘底座和生成背景；其他候选不在首屏加载。服务按明确文件白名单提供资源。

整理脚本：`tools/stage-art-assets.py`（只做复制、派色、抽帧、裁切，不修改下载原件）。
原始下载归档在 `E:\Download\Zuma-美术资源\`，未纳入版本库。

打包分发时请连同本文件一起带上。**标注 CC BY 3.0 的图标必须保留署名。**

---

## 1. Kenney（CC0 1.0，无需署名，可商用、可修改、可再分发）

作者：Kenney（[kenney.nl](https://kenney.nl)）。素材包内 `License.txt` 原文：
`License: (Creative Commons Zero, CC0)`。

| 包 | 来源 | 本目录中的文件 |
| --- | --- | --- |
| Rolling Ball Assets | https://kenney.nl/assets/rolling-ball-assets | `balls/kenney-5color/*.png`（由蓝球派生）、`track/entrance.png`、`track/exit.png` |
| Particle Pack | https://kenney.nl/assets/particle-pack | `effects/flash/flare-01.png`、`star-03.png`、`spark-05.png`、`twirl-01.png`；`effects/ring/circle-01.png`、`circle-04.png`；`effects/boom/scorch-01.png`、`muzzle-03.png`；`effects/trail/trace-02.png`、`trace-04.png` |
| Medals | https://kenney.nl/assets/medals | `badges/kenney-medals/shaded_medal1-9.png` |

**改动说明**：`balls/kenney-5color/` 是从 Kenney 蓝球 `ball_blue_large.png`（128×128）水平镜像后
按目标色相重着色得到的五色版本（见脚本中的 `hue_shift_ball`），几何、高光与明暗完全一致。

## 2. OpenGameArt.org

| 素材 | 作者 | 来源 | 许可 | 本目录中的文件 |
| --- | --- | --- | --- | --- |
| Egg Blast | OnTheBus | https://opengameart.org/content/egg-blast | **CC0**（页面 License(s) 字段） | `balls/egg-blast/*.png`（76×76 原生） |
| 25 special effects rendered with blender | rubberduck | https://opengameart.org/content/25-special-effects-rendered-with-blender | **CC0** | `effects/flash-seq/`、`boom-seq/`、`ring-seq/`、`shockwave-seq/` |
| 16 toon muzzle flash | zisongbr | https://opengameart.org/content/16-toon-muzzle-flash | **CC0** | `effects/muzzle-flash-seq/00-11.png` |

**改动说明**：序列帧用等距抽帧从原始 20–40 帧压到 8–12 帧，编号两位、从 `00` 开始。
帧率与循环建议见 `docs/美术资源候选清单.md`。CC0 不要求署名，此处记录仅为可追溯。

## 3. ambientCG（CC0）

| 素材 | 来源 | 许可 | 本目录中的文件 |
| --- | --- | --- | --- |
| PavingStones070 | https://ambientcg.com/view?id=PavingStones070 | **CC0**（ambientCG 全部素材为 CC0） | `track/paving-512x128.jpg` |

**改动说明**：取 1K 贴图的 Color 通道，整幅宽度缩到 512×512 后裁出上方 512×128 横带，
因此横向仍可无缝平铺。法线/粗糙度贴图未取（2D 网页用不到）。

## 4. game-icons.net（**CC BY 3.0，必须署名**）

作者：Lorc、Delapouite、Guard13007 等。图标仓库 https://github.com/game-icons/icons ，
许可见 https://game-icons.net/about.html#license ：`CC BY 3.0`，
署名写法建议 `Icons made by Lorc, Delapouite and Guard13007, available on https://game-icons.net (CC BY 3.0)`。
**如不想承担署名义务，可整体换成下面第 5 节的 MIT / ISC 线条图标。**
本目录中的 SVG 均未经修改，仅改名。

| 本目录文件 | 原始图标 | 作者 |
| --- | --- | --- |
| `icons/back.svg` | back-forth | Lorc |
| `icons/stop.svg` | stopwatch | Lorc |
| `icons/boom.svg` | bright-explosion | Lorc |
| `icons/victory.svg` | laurel-crown | Lorc |
| `icons/defeat.svg` | cracked-glass | Lorc |
| `icons/alternatives/back-return-arrow.svg` | return-arrow | Lorc |
| `icons/alternatives/back-fast-backward.svg` | fast-backward-button | Delapouite |
| `icons/alternatives/stop-pause-button.svg` | pause-button | Guard13007 |
| `icons/alternatives/stop-sign.svg` | stop-sign | Delapouite |
| `icons/alternatives/boom-unlit-bomb.svg` | unlit-bomb | Lorc |
| `icons/alternatives/boom-spiky-explosion.svg` | spiky-explosion | Lorc |
| `icons/alternatives/defeat-shatter.svg` | shatter | Lorc |

## 5. 线条图标备选（无署名义务）

| 套件 | 许可 | 来源 | 本目录中的文件 |
| --- | --- | --- | --- |
| Tabler Icons | MIT | https://tabler.io/icons | `icons/tabler/*.svg` |
| Lucide | ISC | https://lucide.dev | `icons/lucide/*.svg` |

未修改，仅改名。许可全文见各自仓库：https://github.com/tabler/tabler-icons/blob/main/LICENSE 、
https://github.com/lucide-icons/lucide/blob/main/LICENSE 。

这些线条图标目前未用于页面。打包工具只收录页面使用的素材，不把未接入的备选库带进运行包。

## 6. 字体（未复制进本目录）

字体文件较大，留在 `E:\Download\Zuma-美术资源\fonts\`，接入前建议先做子集化（只留字标用到的字）。

| 字体 | 许可 | 来源 | 用途 |
| --- | --- | --- | --- |
| Cinzel | SIL OFL 1.1 | https://fonts.google.com/specimen/Cinzel | ZUMA 英文标题 |
| Marcellus | SIL OFL 1.1 | https://fonts.google.com/specimen/Marcellus | 英文标题备选 |
| ZCOOL XiaoWei（站酷小薇） | SIL OFL 1.1 | https://fonts.google.com/specimen/ZCOOL+XiaoWei | "五色回廊"中文标题 |
| Ma Shan Zheng（马善政毛笔楷书） | SIL OFL 1.1 | https://fonts.google.com/specimen/Ma+Shan+Zheng | 中文标题备选（书法感更强） |

## 7. D 阶段的派生与原创资源

- `balls/vector/*.svg`：从 Kenney Rolling Ball Assets 原始矢量文件中提取蓝球的三条路径，镜像高光到左上并进行五色色相转换，保留原始曲线几何；画布为 256×256，可无损缩放。许可仍为 CC0；原包许可全文在 `licenses/kenney-rolling-ball.txt`。
- `icons/ui/*.svg`：基于本文件第 4 节的 Lorc 图标（CC BY 3.0），删除黑色背景矩形并改为暖金色，原始版本未覆盖。署名：Icons made by Lorc, available on https://game-icons.net (CC BY 3.0). Modified for Zuma: transparent background, gold color and fixed canvas size. 许可链接：https://creativecommons.org/licenses/by/3.0/ 。
- `effects/{flash-seq,boom-seq,ring-seq}/sheet.png`：由 rubberduck 的 CC0 单帧序列横向排列，分别 12、12、8 帧，单帧 128×128。排列未改变帧内容；网页按需播放。普通闪光通过 CSS 灰度和亮度处理，避免紫色素材影响五色球的辨识。
- `launcher/pedestal.svg`：本项目自绘，512×512 透明 SVG；可编辑石质底座，不包含球或文字。
- `backgrounds/courtyard.webp`：2026-10-13 使用内置 imagegen 生成的石庭背景，1672×941 原生画布；仅转换为 WebP，约 120KB。生成提示词及制作方式见 `docs/背景生成记录.md`。

运行包与源码包保留本文件、素材作者与来源链接。网页页脚有可见的素材署名入口。
