"""Verify the packaged Native Messaging host starts and stops the local server."""
from __future__ import annotations

import argparse
import json
import struct
import subprocess
from pathlib import Path


def write_message(process: subprocess.Popen[bytes], payload: dict[str, object]) -> None:
    encoded = json.dumps(payload).encode("utf-8")
    assert process.stdin is not None
    process.stdin.write(struct.pack("<I", len(encoded)) + encoded)
    process.stdin.flush()


def read_exact(stream: object, length: int) -> bytes:
    data = b""
    while len(data) < length:
        chunk = stream.read(length - len(data))  # type: ignore[attr-defined]
        if not chunk:
            raise RuntimeError("Native host closed its output before responding")
        data += chunk
    return data


def read_message(process: subprocess.Popen[bytes]) -> dict[str, object]:
    assert process.stdout is not None
    length = struct.unpack("<I", read_exact(process.stdout, 4))[0]
    payload = json.loads(read_exact(process.stdout, length).decode("utf-8"))
    if not isinstance(payload, dict):
        raise RuntimeError("Native host returned a non-object response")
    return payload


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--exe", required=True)
    args = parser.parse_args()
    executable = Path(args.exe)
    if not executable.exists():
        raise SystemExit(f"Native host executable is missing: {executable}")
    process = subprocess.Popen([str(executable)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        write_message(process, {"id": 1, "command": "ensure-server"})
        started = read_message(process)
        if started.get("id") != 1 or started.get("ok") is not True:
            raise RuntimeError(f"Native host could not start the server: {started}")
        write_message(process, {"id": 2, "command": "stop-server"})
        stopped = read_message(process)
        if stopped.get("id") != 2 or stopped.get("ok") is not True:
            raise RuntimeError(f"Native host could not stop the server: {stopped}")
        print("Native Messaging host smoke test passed.")
    finally:
        if process.stdin:
            process.stdin.close()
        process.wait(timeout=10)


if __name__ == "__main__":
    main()
