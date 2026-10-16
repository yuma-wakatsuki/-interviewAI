"""Chrome Native Messaging host that owns the local InterviewAI server."""
from __future__ import annotations

import json
import os
import struct
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

HOST_NAME = "com.interviewai.transcriber"
EXTENSION_ID = "eaeiijkmkjjoikngdndpgoidgacgfino"
PORT = 8765


def bundled_directory() -> Path:
    if getattr(sys, "frozen", False):
        executable_directory = Path(sys.executable).resolve().parent
        if (executable_directory / "InterviewAI-Local.exe").exists():
            return executable_directory
        return executable_directory / "InterviewAI-Local"
    return Path(__file__).resolve().parents[1] / "release" / "InterviewAI-Local"


def native_host_executable() -> Path:
    return bundled_directory() / "InterviewAI-NativeHost.exe"


def server_executable() -> Path:
    return bundled_directory() / "InterviewAI-Local.exe"


def health_ok() -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/health", timeout=0.5) as response:
            return response.status == 200 and json.load(response).get("model_available") is True
    except (urllib.error.URLError, TimeoutError, ValueError, json.JSONDecodeError):
        return False


class ServerManager:
    def __init__(self) -> None:
        self.process: subprocess.Popen[bytes] | None = None

    def ensure(self) -> dict[str, Any]:
        if health_ok():
            return {"ok": True, "already_running": True}
        executable = server_executable()
        if not executable.exists():
            return {"ok": False, "error": f"InterviewAI server executable is missing: {executable}"}
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        self.process = subprocess.Popen(
            [str(executable)],
            cwd=executable.parent,
            creationflags=flags,
            # Native Messaging uses this process's standard output as a
            # length-prefixed protocol. Server logs must never mix into it.
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            if health_ok():
                return {"ok": True, "already_running": False}
            if self.process.poll() is not None:
                return {"ok": False, "error": "InterviewAI server exited during startup."}
            time.sleep(0.25)
        return {"ok": False, "error": "InterviewAI server did not become ready within 30 seconds."}

    def stop(self) -> dict[str, Any]:
        if self.process is None or self.process.poll() is not None:
            return {"ok": True, "stopped": False}
        self.process.terminate()
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait(timeout=5)
        return {"ok": True, "stopped": True}


def read_message() -> dict[str, Any] | None:
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length:
        return None
    if len(raw_length) != 4:
        raise ValueError("Incomplete native message length")
    length = struct.unpack("<I", raw_length)[0]
    raw_payload = sys.stdin.buffer.read(length)
    if len(raw_payload) != length:
        raise ValueError("Incomplete native message payload")
    payload = json.loads(raw_payload.decode("utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("Native message must be an object")
    return payload


def write_message(payload: dict[str, Any]) -> None:
    raw_payload = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(raw_payload)))
    sys.stdout.buffer.write(raw_payload)
    sys.stdout.buffer.flush()


def install() -> None:
    if os.name != "nt":
        raise RuntimeError("Native Messaging installation is supported on Windows only.")
    import winreg

    executable = native_host_executable()
    if not executable.exists():
        raise RuntimeError(f"Native host executable is missing: {executable}")
    manifest_path = executable.with_name(f"{HOST_NAME}.json")
    manifest_path.write_text(json.dumps({
        "name": HOST_NAME,
        "description": "InterviewAI local server launcher",
        "path": str(executable),
        "type": "stdio",
        "allowed_origins": [f"chrome-extension://{EXTENSION_ID}/"],
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    key_path = rf"Software\Google\Chrome\NativeMessagingHosts\{HOST_NAME}"
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path) as key:
        winreg.SetValueEx(key, None, 0, winreg.REG_SZ, str(manifest_path))


def main() -> None:
    manager = ServerManager()
    try:
        while message := read_message():
            request_id = message.get("id")
            try:
                command = message.get("command")
                if command == "ensure-server":
                    response = manager.ensure()
                elif command == "stop-server":
                    response = manager.stop()
                else:
                    response = {"ok": False, "error": f"Unknown native command: {command}"}
            except Exception as error:  # Return errors to the extension rather than terminating the host.
                response = {"ok": False, "error": str(error)}
            response["id"] = request_id
            write_message(response)
    finally:
        manager.stop()


if __name__ == "__main__":
    main()
