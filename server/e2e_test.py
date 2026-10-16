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
INTERVIEWER_WAV = ROOT / "models" / "sherpa-onnx-zipformer-ja-reazonspeech-2024-08-01" / "test_wavs" / "2.wav"
URL = os.environ.get("INTERVIEWAI_WS_URL", "ws://127.0.0.1:8765/ws")


async def send_audio(ws: websockets.ClientConnection, speaker: str, sequence: int, pcm: bytes) -> None:
    header = {"type": "audio", "speaker": speaker, "sequence": sequence,
              "sampleRate": 16000, "samples": len(pcm) // 2}
    await ws.send(json.dumps({"type": "header", "header": json.dumps(header)}))
    await ws.send(pcm)


async def main() -> None:
    if not WAV.exists() or not INTERVIEWER_WAV.exists():
        raise SystemExit("Model test audio is missing. Run: python -m server.download_model")
    with wave.open(str(WAV), "rb") as source:
        if (source.getframerate(), source.getnchannels(), source.getsampwidth()) != (16000, 1, 2):
            raise SystemExit("Unexpected model test WAV format")
        speech = source.readframes(16000 * 3)
    with wave.open(str(INTERVIEWER_WAV), "rb") as source:
        if (source.getframerate(), source.getnchannels(), source.getsampwidth()) != (16000, 1, 2):
            raise SystemExit("Unexpected interviewer test WAV format")
        interviewer_speech = source.readframes(16000 * 3)
    received: list[dict[str, str]] = []
    async with websockets.connect(URL, max_size=2**23) as ws:
        final_received = asyncio.Event()

        async def receive() -> None:
            while True:
                message = json.loads(await ws.recv())
                received.append(message)
                if (message.get("type") == "final"
                        and {item.get("speaker") for item in received if item.get("type") == "final"}
                        == {"candidate", "interviewer"}):
                    final_received.set()

        receiver = asyncio.create_task(receive())
        # Match the extension's 100 ms packets rather than sending one large
        # test frame. This catches a protocol or batching regression.
        packet_bytes = 16000 // 10 * 2
        candidate_sequence = 0
        interviewer_sequence = 0
        for offset in range(0, len(speech), packet_bytes):
            await send_audio(ws, "candidate", candidate_sequence, speech[offset:offset + packet_bytes])
            await send_audio(ws, "interviewer", interviewer_sequence, interviewer_speech[offset:offset + packet_bytes])
            candidate_sequence += 1
            interviewer_sequence += 1
            await asyncio.sleep(0.1)
        for _ in range(8):
            silence = b"\0\0" * (16000 // 10)
            await send_audio(ws, "candidate", candidate_sequence, silence)
            await send_audio(ws, "interviewer", interviewer_sequence, silence)
            candidate_sequence += 1
            interviewer_sequence += 1
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
    finals = [item for item in received if item.get("type") == "final"]
    candidate_final = next((item for item in finals if item.get("speaker") == "candidate"), None)
    speakers = {item.get("speaker") for item in partials + finals}
    if (not any(item.get("speaker") == "candidate" and "気象庁" in item.get("text", "") for item in partials)
            or not candidate_final or "気象庁" not in candidate_final.get("text", "")
            or speakers != {"candidate", "interviewer"}
            or {item.get("speaker") for item in finals} != {"candidate", "interviewer"}):
        raise SystemExit(f"ASR protocol check failed: {json.dumps(received, ensure_ascii=False)}")
    print("PASS: received separate partial and final Japanese recognition results for both speakers")


if __name__ == "__main__":
    asyncio.run(main())
