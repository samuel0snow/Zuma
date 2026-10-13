"""Prepare project-owned SVGs, transparent icon variants and effect atlases.

Requires Pillow for atlas assembly and format conversion; runtime needs neither.
Original candidate assets are preserved.
"""
from pathlib import Path
import argparse
import copy
import colorsys
import xml.etree.ElementTree as ET
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "web" / "assets"
ET.register_namespace("", "http://www.w3.org/2000/svg")


def prepare_icons():
    output = ASSETS / "icons" / "ui"
    output.mkdir(parents=True, exist_ok=True)
    for name in ["back", "stop", "boom", "victory", "defeat"]:
        root = ET.parse(ASSETS / "icons" / f"{name}.svg").getroot()
        for child in list(root):
            if child.attrib.get("d", "").replace(" ", "") == "M00h512v512H0z":
                root.remove(child)
            elif child.attrib.get("fill") in ["#fff", "#FFFFFF"]:
                child.set("fill", "#e4c887")
        root.set("width", "128")
        root.set("height", "128")
        ET.ElementTree(root).write(output / f"{name}.svg", encoding="utf-8", xml_declaration=True)


def prepare_atlases():
    for kind in ["flash-seq", "boom-seq", "ring-seq"]:
        folder = ASSETS / "effects" / kind
        frames = [Image.open(path).convert("RGBA") for path in sorted(folder.glob("[0-9][0-9].png"))]
        if not frames:
            raise ValueError(f"missing sequence: {folder}")
        width, height = frames[0].size
        atlas = Image.new("RGBA", (width * len(frames), height))
        for index, frame in enumerate(frames):
            if frame.size != (width, height):
                raise ValueError("inconsistent frame size")
            atlas.paste(frame, (width * index, 0))
        atlas.save(folder / "sheet.png", optimize=True)


def vector_balls(archive):
    source = archive / "kenney/extracted/kenney_rolling-ball-assets/Vector/rollingBall_vector.svg"
    root = ET.parse(source).getroot()
    if args.inspect_vector:
        for index, node in enumerate(root[1]):
            if node.attrib.get("fill") in ["#419FDD", "#5BB2EC", "#80CBFF", "#327AAA"]:
                print(index, node.attrib.get("fill"), node.attrib.get("d", "")[:160])
        return
    output = ASSETS / "balls" / "vector"
    output.mkdir(parents=True, exist_ok=True)
    for name, hue in {"red":2,"green":130,"blue":208,"yellow":48,"purple":285}.items():
        svg = ET.Element("{http://www.w3.org/2000/svg}svg", {"viewBox":"146 162 60 60","width":"256","height":"256"})
        group = ET.SubElement(svg,"{http://www.w3.org/2000/svg}g",{"transform":"translate(352 0) scale(-1 1)"})
        # Three adjacent paths are the original large blue ball at (176,192).
        # Preserve its Bezier geometry and mirror the highlight to upper left.
        for node in list(root[1])[44:47]:
            node = copy.deepcopy(node)
            color = node.attrib["fill"].lstrip("#")
            rgb = [int(color[i:i+2],16)/255 for i in (0,2,4)]
            _, saturation, value = colorsys.rgb_to_hsv(*rgb)
            rgb = colorsys.hsv_to_rgb(hue/360,saturation,value)
            node.set("fill", "#"+"".join(f"{round(channel*255):02x}" for channel in rgb))
            group.append(node)
        ET.ElementTree(svg).write(output / f"{name}.svg", encoding="utf-8",xml_declaration=True)
    licenses = ASSETS / "licenses"
    licenses.mkdir(exist_ok=True)
    license_path = archive / "kenney/extracted/kenney_rolling-ball-assets/License.txt"
    if license_path.exists(): (licenses/"kenney-rolling-ball.txt").write_bytes(license_path.read_bytes())


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--background", type=Path)
    parser.add_argument("--archive", type=Path, default=Path("E:/Download/Zuma-美术资源"))
    parser.add_argument("--inspect-vector", action="store_true")
    args = parser.parse_args()
    if args.inspect_vector:
        vector_balls(args.archive)
    else:
        prepare_icons()
        prepare_atlases()
        vector_balls(args.archive)
        if args.background:
            output = ASSETS / "backgrounds"
            output.mkdir(parents=True, exist_ok=True)
            Image.open(args.background).convert("RGB").save(output / "courtyard.webp", quality=82, method=6)
