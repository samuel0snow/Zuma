"""Create source and Windows runtime ZIPs without external dependencies."""
from pathlib import Path
import argparse
import hashlib
import json
import shutil
import zipfile
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def copy(source, target):
    if source.is_dir():
        shutil.copytree(source, target, dirs_exist_ok=True, ignore=shutil.ignore_patterns("__pycache__"))
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)

def runtime_web(source, target):
    target.mkdir(parents=True, exist_ok=True)
    for name in ["index.html","style.css","app.js","animation.js"]:
        copy(source/name,target/name)
    for name in ["backgrounds","launcher","balls/vector","balls/gemstone","icons/ui","track","licenses"]:
        copy(source/"assets"/name,target/"assets"/name)
    copy(source/"assets/CREDITS.md",target/"assets/CREDITS.md")
    copy(source/"assets/favicon.svg",target/"assets/favicon.svg")
    for name in ["flash-seq","boom-seq","ring-seq"]:
        copy(source/"assets/effects"/name/"sheet.png",target/"assets/effects"/name/"sheet.png")


def archive(folder, destination):
    with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as output:
        for path in sorted(folder.rglob("*")):
            if path.is_file():
                output.write(path, Path(folder.name) / path.relative_to(folder))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--build", type=Path, default=ROOT / "build")
    parser.add_argument("--output", type=Path, default=ROOT / "build/releases")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="zuma-stage-", dir=args.output) as temporary:
        staging = Path(temporary).resolve()
        if not staging.is_relative_to(args.output.resolve()):
            raise ValueError("staging directory leaves output directory")
        runtime = staging / "Zuma-windows-x64"
        runtime.mkdir(exist_ok=True)
        for name in ["zuma.exe", "zuma_gui.exe"]:
            source = args.build / name
            if not source.is_file():
                raise FileNotFoundError(f"Build {name} before packaging")
            copy(source, runtime / name)
        for name in ["levels", "third_party"]:
            copy(args.build / name, runtime / name)
        runtime_web(args.build/"web",runtime/"web")
        for name in ["README.md", "docs"]:
            copy(ROOT / name, runtime / name)
        copy(ROOT / "docs/运行与交付说明.md", runtime / "运行说明.md")
        (runtime / "启动GUI.cmd").write_text('@echo off\r\ncd /d "%~dp0"\r\nzuma_gui.exe\r\npause\r\n', encoding="ascii")
        (runtime / "启动CLI.cmd").write_text('@echo off\r\ncd /d "%~dp0"\r\nzuma.exe\r\npause\r\n', encoding="ascii")
        manifest = {}
        for file in sorted(runtime.rglob("*")):
            if file.is_file() and file.name != "SHA256.json":
                manifest[file.relative_to(runtime).as_posix()] = hashlib.sha256(file.read_bytes()).hexdigest()
        (runtime / "SHA256.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        archive(runtime, args.output / "Zuma-windows-x64.zip")
        # The source archive includes editable code and already-prepared assets.
        # It does not depend on the machine-specific art download folder.
        source = staging / "Zuma-source"
        source.mkdir(exist_ok=True)
        for name in [".gitignore", "CMakeLists.txt", "README.md", "levels", "include", "src", "web", "third_party", "tests", "tools", "docs"]:
            copy(ROOT / name, source / name)
        archive(source, args.output / "Zuma-source.zip")
    print(args.output / "Zuma-windows-x64.zip")
    print(args.output / "Zuma-source.zip")


if __name__ == "__main__":
    main()
