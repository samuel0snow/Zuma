#!/usr/bin/env python3
"""把已核实的免费美术素材整理成 web/assets/ 下的候选资源。

素材来源与许可见 web/assets/CREDITS.md 与 docs/美术资源/美术资源候选清单.md。
脚本只做"复制 + 派色 + 抽帧 + 裁切"，不改动下载目录里的原件。

用法（在项目根目录）：
    python tools/stage-art-assets.py
    python tools/stage-art-assets.py --src "E:\\Download\\Zuma-美术资源" --dst web/assets

依赖 Pillow。派生色相的做法：只改饱和度足够的像素的 H 通道，
保留原有的 S/V 与白色高光，因此五颗球的几何、高光和明暗完全一致。
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from PIL import Image

# Kenney 彩球原图是"蓝色球 + 右上高光"，需求文档要求左上高光，所以先水平镜像。
BALL_BASE = "kenney/extracted/kenney_rolling-ball-assets/PNG/Retina/ball_blue_large.png"

# 目标色相（角度）-> 输出文件名。蓝色保持接近原图色相，减少改动。
BALL_HUES = {
    "red": 2,
    "green": 130,
    "blue": 208,
    "yellow": 48,
    "purple": 285,
}

EGG_BLAST = {
    "red": "EggRed.png",
    "green": "EggGreen.png",
    "blue": "EggBlue.png",
    "yellow": "EggYellow.png",
    "purple": "EggPurp.png",
}

# 主选按"32px 下仍能辨认 + 实心风格统一"从候选里挑出，见 docs/美术资源/美术资源候选清单.md。
GAME_ICONS = {
    "back.svg": "game-icons_lorc_back-forth.svg",
    "stop.svg": "game-icons_lorc_stopwatch.svg",
    "boom.svg": "game-icons_lorc_bright-explosion.svg",
    "victory.svg": "game-icons_lorc_laurel-crown.svg",
    "defeat.svg": "game-icons_lorc_cracked-glass.svg",
}

GAME_ICON_ALTS = {
    "back-return-arrow.svg": "game-icons_lorc_return-arrow.svg",
    "back-fast-backward.svg": "game-icons_delapouite_fast-backward-button.svg",
    "stop-pause-button.svg": "game-icons_guard13007_pause-button.svg",
    "stop-sign.svg": "game-icons_delapouite_stop-sign.svg",
    "boom-unlit-bomb.svg": "game-icons_lorc_unlit-bomb.svg",
    "boom-spiky-explosion.svg": "game-icons_lorc_spiky-explosion.svg",
    "defeat-shatter.svg": "game-icons_lorc_shatter.svg",
}

# 线条风格的第二套备选（MIT / ISC），风格与实心图标不同，做 UI 时可整体切换。
LINE_ICON_DIRS = ("icons/tabler", "icons/lucide")

# Kenney 粒子包里的白色可调色素材（CC0）。
KENNEY_PARTICLES = {
    "effects/flash/flare-01.png": "kenney_particle-pack/PNG (Transparent)/flare_01.png",
    "effects/flash/star-03.png": "kenney_particle-pack/PNG (Transparent)/star_03.png",
    "effects/flash/spark-05.png": "kenney_particle-pack/PNG (Transparent)/spark_05.png",
    "effects/flash/twirl-01.png": "kenney_particle-pack/PNG (Transparent)/twirl_01.png",
    "effects/ring/circle-01.png": "kenney_particle-pack/PNG (Transparent)/circle_01.png",
    "effects/ring/circle-04.png": "kenney_particle-pack/PNG (Transparent)/circle_04.png",
    "effects/boom/scorch-01.png": "kenney_particle-pack/PNG (Transparent)/scorch_01.png",
    "effects/boom/muzzle-03.png": "kenney_particle-pack/PNG (Transparent)/muzzle_03.png",
    "effects/trail/trace-02.png": "kenney_particle-pack/PNG (Transparent)/trace_02.png",
    "effects/trail/trace-04.png": "kenney_particle-pack/PNG (Transparent)/trace_04.png",
}

# OGA（CC0，rubberduck《25 special effects rendered with blender》）抽帧成序列。
EFFECT_SEQUENCES = {
    "effects/flash-seq": ("oga/effects/blender-volumetric-particles-effects/effect-images/flat_effect/magic", 12),
    "effects/boom-seq": ("oga/effects/blender-volumetric-particles-effects/effect-images/explosion/fire", 12),
    "effects/ring-seq": ("oga/effects/blender-volumetric-particles-effects/effect-images/ring/magic", 8),
    "effects/shockwave-seq": ("oga/effects/blender-volumetric-particles-effects/effect-images/shockwave/magic", 8),
}

# OGA（CC0，Master484）16 帧卡通枪口闪光，256x256，可当 Boom/发射闪光参考。
MUZZLE_SRC = "oga/effects/muzzle_flashs/muzzle_flashs"

TRACK_SOURCES = {
    "track/paving-512x128.jpg": "ambientcg/PavingStones070_1K-JPG/PavingStones070_1K-JPG_Color.jpg",
}


def hue_shift_ball(src: Path, dst: Path, hue_deg: float) -> None:
    """把球体的彩色部分整体换色，保留高光与明暗。"""
    img = Image.open(src).convert("RGBA")
    img = img.transpose(Image.FLIP_LEFT_RIGHT)  # 高光移到左上
    rgb = img.convert("RGB")
    h, s, v = rgb.convert("HSV").split()
    hue_byte = int(round(hue_deg / 360.0 * 255)) % 256
    colored = s.point(lambda px: 255 if px > 20 else 0)
    h = Image.composite(Image.new("L", h.size, hue_byte), h, colored)
    shifted = Image.merge("HSV", (h, s, v)).convert("RGB").convert("RGBA")
    shifted.putalpha(img.getchannel("A"))
    dst.parent.mkdir(parents=True, exist_ok=True)
    shifted.save(dst, "PNG", optimize=True)


def sample_sequence(src_dir: Path, dst_dir: Path, count: int) -> list[str]:
    """从 30/40 帧的原始序列里等距抽 count 帧，按两位编号输出。"""
    frames = sorted(src_dir.glob("*.png"))
    if not frames:
        raise FileNotFoundError(f"没有找到序列帧: {src_dir}")
    if count > len(frames):
        count = len(frames)
    idx = [round(i * (len(frames) - 1) / (count - 1)) for i in range(count)] if count > 1 else [0]
    dst_dir.mkdir(parents=True, exist_ok=True)
    for n, i in enumerate(idx):
        shutil.copy2(frames[i], dst_dir / f"{n:02d}.png")
    return [f"{n:02d}.png" for n in range(count)]


def make_track_band(src: Path, dst: Path) -> tuple[int, int]:
    """取可平铺贴图整幅宽度的一条横带，缩到 512x128，横向仍可无缝平铺。"""
    img = Image.open(src).convert("RGB")
    img = img.resize((512, 512), Image.LANCZOS)
    band = img.crop((0, 0, 512, 128))
    dst.parent.mkdir(parents=True, exist_ok=True)
    band.save(dst, "JPEG", quality=88, optimize=True)
    return band.size


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=r"E:\Download\Zuma-美术资源")
    ap.add_argument("--dst", default="web/assets")
    args = ap.parse_args()

    src_root = Path(args.src)
    dst_root = Path(args.dst)
    report: list[str] = []

    def copy(src: Path, dst: Path) -> None:
        if not src.exists():
            report.append(f"缺失: {src}")
            return
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        report.append(f"{dst.as_posix()}  <-  {src.name}  ({dst.stat().st_size} B)")

    # 1. 五色彩球（由 CC0 蓝球派生）
    for name, hue in BALL_HUES.items():
        out = dst_root / "balls" / "kenney-5color" / f"{name}.png"
        hue_shift_ball(src_root / BALL_BASE, out, hue)
        with Image.open(out) as im:
            report.append(f"{out.as_posix()}  <-  Kenney 蓝球 H={hue}°  ({im.size[0]}x{im.size[1]})")

    # 2. OGA Egg Blast 原生五色球（备选，76x76）
    for name, fn in EGG_BLAST.items():
        copy(src_root / "oga/egg-blast" / fn, dst_root / "balls" / "egg-blast" / f"{name}.png")

    # 3. 属性 / 胜负图标
    for name, fn in GAME_ICONS.items():
        copy(src_root / "icons" / fn, dst_root / "icons" / name)
    for name, fn in GAME_ICON_ALTS.items():
        copy(src_root / "icons" / fn, dst_root / "icons" / "alternatives" / name)
    for svg_dir in LINE_ICON_DIRS:
        kind = Path(svg_dir).name
        for svg in sorted((src_root / svg_dir).glob("*.svg")):
            copy(svg, dst_root / "icons" / kind / svg.name)

    # 4. 动效：白色可调色粒子
    for rel, src_rel in KENNEY_PARTICLES.items():
        copy(src_root / "kenney/extracted" / src_rel, dst_root / rel)

    # 5. 动效：抽帧序列
    for rel, (src_rel, count) in EFFECT_SEQUENCES.items():
        frames = sample_sequence(src_root / src_rel, dst_root / rel, count)
        report.append(f"{rel}/  {len(frames)} 帧 (00.png … {frames[-1]})  <-  {Path(src_rel).name}")

    # 6. 卡通闪光 16 帧（256x256）
    muzzle = sorted((src_root / MUZZLE_SRC).glob("*.png"))
    for n, f in enumerate(muzzle[:12]):
        copy(f, dst_root / "effects" / "muzzle-flash-seq" / f"{n:02d}.png")

    # 7. 轨道贴图与出入口装饰
    for rel, src_rel in TRACK_SOURCES.items():
        size = make_track_band(src_root / src_rel, dst_root / rel)
        report.append(f"{rel}  {size[0]}x{size[1]} (横向无缝)  <-  {Path(src_rel).name}")
    for name, fn in {"entrance.png": "hole_start.png", "exit.png": "hole_large_end.png"}.items():
        copy(
            src_root / "kenney/extracted/kenney_rolling-ball-assets/PNG/Retina" / fn,
            dst_root / "track" / name,
        )

    # 8. 徽章（Kenney 奖牌，CC0 备选）
    for medal in sorted(
        (src_root / "kenney/extracted/kenney_medals/PNG").glob("shaded_medal*.png")
    ):
        copy(medal, dst_root / "badges" / "kenney-medals" / medal.name)

    print("\n".join(report))
    print(f"\n共 {len([r for r in report if not r.startswith('缺失')])} 项，输出到 {dst_root.resolve()}")


if __name__ == "__main__":
    main()
