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
        final_received = asyncio.Event()

        async def receive() -> None:
            while True:
                message = json.loads(await ws.recv())
                received.append(message)
                if message.get("type") == "final":
                    final_received.set()

        receiver = asyncio.create_task(receive())
        # Match the extension's 100 ms packets rather than sending one large
        # test frame. This catches a protocol or batching regression.
        packet_bytes = 16000 // 10 * 2
        sequence = 0
        for offset in range(0, len(speech), packet_bytes):
            await send_audio(ws, sequence, speech[offset:offset + packet_bytes])
            sequence += 1
            await asyncio.sleep(0.1)
        for _ in range(8):
            await send_audio(ws, sequence, b"\0\0" * (16000 // 10))
            sequence += 1
            await asyncio.sleep(0.1)
        try:
            await asyncio.wait_for(final_received.wait(), timeout=20)
        except asyncio.TimeoutError:
            pass
        receiver.cancel()
        try:
            await receiver
        except asyncio.CancelledError:
            pass
    partials = [item for item in received if item.get("type") == "partial"]
    final = next((item for item in received if item.get("type") == "final"), None)
    if not any("気象庁" in item.get("text", "") for item in partials) or not final or "気象庁" not in final.get("text", ""):
        raise SystemExit(f"ASR protocol check failed: {json.dumps(received, ensure_ascii=False)}")
    print("PASS: received partial and final Japanese recognition results")


if __name__ == "__main__":
    asyncio.run(main())
