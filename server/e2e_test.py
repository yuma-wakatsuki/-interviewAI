"""Exercise the WebSocket audio protocol against a running local server.

Start the server in another terminal, then run:
    .venv\\Scripts\\python.exe -m server.e2e_test
"""
import asyncio
import json
import os
import wave
from pathlib import Path

import websockets

ROOT = Path(__file__).resolve().parent
WAV = ROOT / "models" / "sherpa-onnx-zipformer-ja-reazonspeech-2024-08-01" / "test_wavs" / "1.wav"
URL = os.environ.get("INTERVIEWAI_WS_URL", "ws://127.0.0.1:8765/ws")


async def send_audio(ws: websockets.ClientConnection, sequence: int, pcm: bytes) -> None:
    header = {"type": "audio", "speaker": "candidate", "sequence": sequence,
              "sampleRate": 16000, "samples": len(pcm) // 2}
    await ws.send(json.dumps({"type": "header", "header": json.dumps(header)}))
    await ws.send(pcm)


async def main() -> None:
    if not WAV.exists():
        raise SystemExit("Model test audio is missing. Run: python -m server.download_model")
    with wave.open(str(WAV), "rb") as source:
        if (source.getframerate(), source.getnchannels(), source.getsampwidth()) != (16000, 1, 2):
            raise SystemExit("Unexpected model test WAV format")
        speech = source.readframes(16000 * 3)
    received: list[dict[str, str]] = []
    async with websockets.connect(URL, max_size=2**23) as ws:
        await send_audio(ws, 0, speech)
        await asyncio.sleep(1.2)
        await send_audio(ws, 1, b"\0\0" * 16000)
        deadline = asyncio.get_running_loop().time() + 20
        while asyncio.get_running_loop().time() < deadline:
            try:
                message = json.loads(await asyncio.wait_for(ws.recv(), timeout=1))
                received.append(message)
            except asyncio.TimeoutError:
                continue
    partial = next((item for item in received if item.get("type") == "partial"), None)
    final = next((item for item in received if item.get("type") == "final"), None)
    if not partial or not final or "気象庁" not in partial.get("text", "") or "気象庁" not in final.get("text", ""):
        raise SystemExit(f"ASR protocol check failed: {json.dumps(received, ensure_ascii=False)}")
    print("PASS: received partial and final Japanese recognition results")


if __name__ == "__main__":
    asyncio.run(main())
