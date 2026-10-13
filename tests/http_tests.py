"""End-to-end HTTP contract checks. Uses only Python's standard library."""
import concurrent.futures
import json
import pathlib
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request


def main():
    executable = pathlib.Path(sys.argv[1]).resolve()
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    base = f"http://127.0.0.1:{port}"

    def request(path, body=None, headers=None, raw=None):
        data = raw if raw is not None else json.dumps(body).encode() if body is not None else None
        all_headers = {"Content-Type": "application/json", "X-Zuma-Client": "1"}
        all_headers.update(headers or {})
        req = urllib.request.Request(base + path, data=data, headers=all_headers)
        try:
            with urllib.request.urlopen(req, timeout=5) as res:
                return res.status, res.read(), res.headers
        except urllib.error.HTTPError as res:
            return res.code, res.read(), res.headers

    def post(path, state, request_id, **extra):
        body = dict(sessionId=state["sessionId"], version=state["version"], requestId=request_id, **extra)
        status, data, _ = request(path, body)
        return status, json.loads(data), body

    with tempfile.TemporaryDirectory() as folder:
        levels = pathlib.Path(folder)
        (levels / "level1.txt").write_text("ACTIVE=RR\nFEED=\nAMMO=R\nMAX_LENGTH=2\n")
        (levels / "level2.txt").write_text("ACTIVE=R\nFEED=G\nAMMO=B\nMAX_LENGTH=1\n")
        # Launch outside the checkout and use the packaged web assets beside
        # the executable, rather than relying on the working directory.
        process = subprocess.Popen([str(executable), "--port", str(port), "--levels", str(levels), "--test-mode"], cwd=folder, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        try:
            for _ in range(100):
                if process.poll() is not None:
                    raise RuntimeError(process.stderr.read().decode(errors="replace"))
                try:
                    status, data, _ = request("/api/game")
                    if status == 200:
                        break
                except (OSError, urllib.error.URLError):
                    time.sleep(0.05)
            else:
                raise RuntimeError("server did not become ready")
            for asset in ["/", "/style.css", "/app.js", "/animation.js"]:
                code, content, hdr = request(asset)
                assert code == 200 and content and hdr["X-Content-Type-Options"] == "nosniff"
            for asset, mime in [("/assets/balls/vector/blue.svg", "image/svg+xml"),
                                ("/assets/icons/ui/back.svg", "image/svg+xml"),
                                ("/assets/launcher/pedestal.svg", "image/svg+xml"),
                                ("/assets/backgrounds/courtyard.webp", "image/webp"),
                                ("/assets/effects/flash-seq/sheet.png", "image/png"),
                                ("/assets/effects/boom-seq/sheet.png", "image/png"),
                                ("/assets/effects/ring-seq/sheet.png", "image/png")]:
                code, content, hdr = request(asset)
                assert code == 200 and content and hdr["Content-Type"].startswith(mime)
            assert request("/assets/icons/ui/backZsvg")[0] == 404
            assert request("/assets/../CMakeLists.txt")[0] == 404
            assert request("/assets/licenses/kenney-rolling-ball.txt")[0] == 404
            assert request("/../CMakeLists.txt")[0] == 404
            assert request("/api/game", {"x": 1}, {"Origin": "https://example.com"})[0] == 403
            assert request("/api/game", raw=b"{broken")[0] == 400
            assert request("/api/game", raw=b"[" * 100 + b"0" + b"]" * 100)[0] == 400
            assert request("/api/game", raw=b"x" * 9000)[0] == 413
            ready = json.loads(data)["state"]
            code, created, create_body = post("/api/game", ready, "create", levelId=1, specialsEnabled=False, seed=42)
            assert code == 200
            assert json.loads(request("/api/game", create_body)[1]) == created
            state = created["state"]
            for position in [True, "2", 2.5, 0, 4, -1]:
                assert post("/api/action", state, f"bad-{position}", type="shoot", position=position)[0] == 400
            assert json.loads(request("/api/game")[1])["state"] == state
            code, won, shot = post("/api/action", state, "shot", type="shoot", position=2)
            assert code == 200 and won["state"]["status"] == "won" and won["state"]["score"] == 30
            assert json.loads(request("/api/action", shot)[1]) == won
            assert post("/api/action", won["state"], "after-win", type="discard")[0] == 409
            code, reset, _ = post("/api/reset", won["state"], "reset")
            assert code == 200 and reset["state"]["status"] == "ready"
            assert post("/api/action", state, "old", type="discard")[0] == 409
            code, second, _ = post("/api/game", reset["state"], "second", levelId=2, specialsEnabled=True, seed=7)
            assert code == 200 and second["state"]["specialChancePercent"] == 10
            command = dict(sessionId=second["state"]["sessionId"], version=second["state"]["version"], requestId="concurrent", type="discard")
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
                replies = list(pool.map(lambda _: request("/api/action", command), range(4)))
            assert all(reply[0] == 200 for reply in replies)
            payloads = [json.loads(reply[1]) for reply in replies]
            assert all(payload == payloads[0] for payload in payloads)
            assert payloads[0]["state"]["turns"] == 1 and payloads[0]["state"]["status"] == "lost"
            assert request("/api/game", headers={"Host": "evil.example"})[0] == 403
            print("HTTP assets, validation, origin, duplicate/concurrent requests, victory/loss/reset passed.")
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
            process.stderr.close()


if __name__ == "__main__":
    main()
