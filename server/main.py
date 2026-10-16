"""Phase 1 diagnostic server: validates PCM frames and writes separate WAV files; no transcript is persisted."""
import asyncio, json, logging, struct, time, wave
from collections import defaultdict
from pathlib import Path
from typing import Any
import numpy as np
import psutil
import sherpa_onnx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
app = FastAPI()
OUT = Path("diagnostics/audio")
RATE, CHANNELS, WIDTH = 16_000, 1, 2
MODEL = Path("server/models/sherpa-onnx-zipformer-ja-reazonspeech-2024-08-01")

def recognizer() -> sherpa_onnx.OfflineRecognizer:
    return sherpa_onnx.OfflineRecognizer.from_transducer(encoder=str(MODEL/'encoder-epoch-99-avg-1.int8.onnx'), decoder=str(MODEL/'decoder-epoch-99-avg-1.int8.onnx'), joiner=str(MODEL/'joiner-epoch-99-avg-1.int8.onnx'), tokens=str(MODEL/'tokens.txt'), num_threads=4, sample_rate=RATE, feature_dim=80)

class Session:
    def __init__(self) -> None:
        OUT.mkdir(parents=True, exist_ok=True)
        self.stamp = time.strftime("%Y%m%d-%H%M%S")
        self.wav: dict[str, wave.Wave_write] = {}
        self.sequence = defaultdict(lambda: -1)
        self.started = time.monotonic()
        self.asr = recognizer() if MODEL.exists() else None
        self.audio = defaultdict(bytearray)
        self.last_partial = defaultdict(float)

    def write(self, speaker: str, data: bytes) -> None:
        writer = self.wav.get(speaker)
        if writer is None:
            writer = wave.open(str(OUT / f"{self.stamp}-{speaker}.wav"), "wb")
            writer.setparams((CHANNELS, WIDTH, RATE, 0, "NONE", "not compressed"))
            self.wav[speaker] = writer
        writer.writeframesraw(data)

    def close(self) -> None:
        for writer in self.wav.values(): writer.close()

    def decode(self, speaker: str) -> str:
        if not self.asr or not self.audio[speaker]: return ""
        stream = self.asr.create_stream(); stream.accept_waveform(RATE, np.frombuffer(self.audio[speaker], dtype=np.int16).astype(np.float32)/32768); self.asr.decode_stream(stream); return stream.result.text.strip()

@app.get("/health")
def health() -> dict[str, Any]:
    process = psutil.Process()
    return {"status": "ok", "cpu_percent": process.cpu_percent(), "rss_bytes": process.memory_info().rss}

@app.websocket("/ws")
async def ws(websocket: WebSocket) -> None:
    await websocket.accept(); session = Session(); header: dict[str, Any] | None = None
    try:
        while True:
            message = await asyncio.wait_for(websocket.receive(), timeout=20)
            if message.get("text"):
                payload = json.loads(message["text"])
                if payload.get("type") == "header": header = json.loads(payload["header"])
                continue
            data = message.get("bytes")
            if not header or data is None: raise ValueError("PCM frame without header")
            speaker, sequence, samples = header["speaker"], header["sequence"], header["samples"]
            if speaker not in {"candidate", "interviewer"} or header.get("sampleRate") != RATE or len(data) != samples * WIDTH: raise ValueError(f"invalid frame: {header}")
            if sequence <= session.sequence[speaker]: logging.warning("non-monotonic sequence speaker=%s sequence=%s", speaker, sequence)
            session.sequence[speaker] = sequence; session.write(speaker, data)
            session.audio[speaker].extend(data)
            if time.monotonic() - session.last_partial[speaker] >= 1.0:
                text = await asyncio.to_thread(session.decode, speaker)
                session.last_partial[speaker] = time.monotonic()
                if text: await websocket.send_json({"type":"partial", "speaker":speaker, "text":text, "timestamp":time.strftime('%H:%M:%S')})
            if sequence % 100 == 0:
                process = psutil.Process(); elapsed = time.monotonic() - session.started
                logging.info("audio speaker=%s sequence=%d elapsed=%.1fs cpu=%.1f rss=%d", speaker, sequence, elapsed, process.cpu_percent(), process.memory_info().rss)
                await websocket.send_json({"type":"diagnostic", "detail":f"PCM verified: {speaker} seq={sequence}"})
    except (WebSocketDisconnect, asyncio.TimeoutError): logging.info("client disconnected or timed out")
    except Exception as error:
        logging.exception("session error")
        await websocket.send_json({"type":"diagnostic", "detail":f"server error: {error}"})
    finally: session.close()
