"""Run a real-time WebSocket endurance check against the local ASR server.

Examples:
    python -m server.duration_test --seconds 60
    python -m server.duration_test --seconds 600   # 10 minutes

The script replays the model's Japanese test audio at 100 ms intervals and
adds 0.8 seconds of silence between speech turns, exercising both partial and
final recognition without retaining audio on the server.
"""
import argparse
import asyncio
import json
import os
import time
import wave
from collections import Counter
from pathlib import Path

import websockets

ROOT = Path(__file__).resolve().parent
WAV = ROOT / "models" / "sherpa-onnx-zipformer-ja-reazonspeech-2024-08-01" / "test_wavs" / "1.wav"


async def send_audio(ws: websockets.ClientConnection, sequence: int, pcm: bytes) -> None:
    header = {"type": "audio", "speaker": "candidate", "sequence": sequence,
              "sampleRate": 16000, "samples": len(pcm) // 2}
    await ws.send(json.dumps({"type": "header", "header": json.dumps(header)}))
    await ws.send(pcm)


async def run(seconds: int, url: str) -> None:
    if not WAV.exists():
        raise SystemExit("Model test audio is missing. Run: python -m server.download_model")
    with wave.open(str(WAV), "rb") as source:
        audio = source.readframes(source.getnframes())
    packet_bytes = 16000 // 10 * 2
    received: Counter[str] = Counter()
    started = time.monotonic()
    async with websockets.connect(url, max_size=2**23) as ws:
        async def receive() -> None:
            while True:
                message = json.loads(await ws.recv())
                received[message.get("type", "unknown")] += 1

        receiver = asyncio.create_task(receive())
        sequence = 0
        offset = 0
        turn_packets = 0
        while time.monotonic() - started < seconds:
            if turn_packets >= 100:
                packet = b"\0\0" * (16000 // 10)
                turn_packets += 1
                if turn_packets >= 108:
                    turn_packets = 0
            else:
                packet = audio[offset:offset + packet_bytes]
                if len(packet) < packet_bytes:
                    offset = 0
                    packet = audio[:packet_bytes]
                offset += packet_bytes
                turn_packets += 1
            await send_audio(ws, sequence, packet)
            sequence += 1
            await asyncio.sleep(0.1)
        await asyncio.sleep(1)
        receiver.cancel()
        try:
            await receiver
        except asyncio.CancelledError:
            pass
    elapsed = round(time.monotonic() - started, 1)
    if received["partial"] == 0 or received["final"] == 0:
        raise SystemExit(f"Endurance check failed after {elapsed}s: {dict(received)}")
    print(json.dumps({"result": "PASS", "elapsed_seconds": elapsed, "messages": dict(received)}, ensure_ascii=False))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seconds", type=int, default=60)
    parser.add_argument("--url", default=os.environ.get("INTERVIEWAI_WS_URL", "ws://127.0.0.1:8765/ws"))
    args = parser.parse_args()
    if args.seconds < 10:
        raise SystemExit("--seconds must be at least 10")
    asyncio.run(run(args.seconds, args.url))


if __name__ == "__main__":
    main()
