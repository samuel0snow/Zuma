"""Extract and verify the actual distributable, outside the checkout."""
import hashlib
import json
import os
import pathlib
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
import zipfile


def main():
    archive = pathlib.Path(sys.argv[1]).resolve()
    with tempfile.TemporaryDirectory(prefix="Zuma-release-") as temporary:
        temp = pathlib.Path(temporary).resolve()
        with zipfile.ZipFile(archive) as bundle:
            for name in bundle.namelist():
                if not (temp / name).resolve().is_relative_to(temp):
                    raise ValueError("archive path leaves extraction directory")
            bundle.extractall(temp)
        root = temp / "Zuma-windows-x64"
        hashes = json.loads((root / "SHA256.json").read_text(encoding="utf-8"))
        for name, expected in hashes.items():
            file = (root / name).resolve()
            assert file.is_relative_to(root.resolve())
            assert hashlib.sha256(file.read_bytes()).hexdigest() == expected, name
        environment = os.environ.copy()
        system_root = environment.get("SystemRoot") or environment.get("SYSTEMROOT") or environment.get("WINDIR") or "C:/Windows"
        assert (pathlib.Path(system_root)/"System32/kernel32.dll").is_file()
        environment["PATH"] = str(pathlib.Path(system_root) / "System32") + ";" + system_root
        cli = subprocess.run([str(root / "zuma.exe")], input="2\n1\n4\nrestart\nexit\n", text=True, encoding="utf-8", capture_output=True, cwd=temp, env=environment, timeout=10)
        assert cli.returncode == 0 and "得分: 70" in cli.stdout and "已重启游戏" in cli.stdout
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        base = f"http://127.0.0.1:{port}"
        process = subprocess.Popen([str(root / "zuma_gui.exe"), "--port", str(port)], cwd=temp, env=environment, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        def get(path):
            with urllib.request.urlopen(base + path, timeout=5) as response:
                return response.read()
        def post(path, state, request_id, **fields):
            payload = dict(sessionId=state["sessionId"],version=state["version"],requestId=request_id,**fields)
            request=urllib.request.Request(base+path,data=json.dumps(payload).encode(),headers={"Content-Type":"application/json","X-Zuma-Client":"1"})
            with urllib.request.urlopen(request,timeout=5) as response:
                return json.loads(response.read())
        try:
            for _ in range(100):
                if process.poll() is not None:
                    raise RuntimeError(process.stderr.read().decode(errors="replace"))
                try:
                    ready=json.loads(get("/api/game"))["state"]
                    break
                except OSError:
                    time.sleep(.05)
            else: raise RuntimeError("packaged server not ready")
            for asset in ["/","/app.js","/animation.js","/assets/backgrounds/courtyard.webp","/assets/launcher/pedestal.svg","/assets/balls/vector/red.svg","/assets/icons/ui/back.svg","/assets/effects/boom-seq/sheet.png","/assets/CREDITS.md"]:
                assert get(asset), asset
            game=post("/api/game",ready,"create",levelId=1,specialsEnabled=False)["state"]
            result=post("/api/action",game,"shot",type="shoot",position=4)["state"]
            assert result["score"]==70 and result["turns"]==1 and result["track"][0]["color"]=="G"
            assert post("/api/reset",result,"reset")["state"]["status"]=="ready"
            print(f"Runtime ZIP: {len(hashes)} file hashes, isolated PATH, standalone CLI and GUI assets/API passed.")
        finally:
            process.terminate()
            try: process.wait(timeout=5)
            except subprocess.TimeoutExpired: process.kill();process.wait()
            process.stderr.close()


if __name__=="__main__": main()
