"""Phase 1 diagnostic server: validates PCM frames and writes separate WAV files; no transcript is persisted."""
import asyncio, json, logging, os, re, struct, time, wave
from collections import defaultdict
from pathlib import Path
from typing import Any
import numpy as np
import psutil
import sherpa_onnx
from server.metrics import record
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
app = FastAPI()
OUT = Path("diagnostics/audio")
RATE, CHANNELS, WIDTH = 16_000, 1, 2
DIAGNOSTIC_WAV = os.environ.get("INTERVIEWAI_DIAGNOSTIC_WAV") == "1"
MAX_BUFFER_BYTES = RATE * WIDTH * 30
MIN_PARTIAL_AUDIO_SECONDS = 0.8
PARTIAL_INTERVAL_SECONDS = 1.0
MIN_FINAL_AUDIO_SECONDS = 0.6
FINAL_SILENCE_SAMPLES = int(RATE * 0.8)
MODEL = Path("server/models/sherpa-onnx-zipformer-ja-reazonspeech-2024-08-01")

def recognizer() -> sherpa_onnx.OfflineRecognizer:
    return sherpa_onnx.OfflineRecognizer.from_transducer(encoder=str(MODEL/'encoder-epoch-99-avg-1.int8.onnx'), decoder=str(MODEL/'decoder-epoch-99-avg-1.int8.onnx'), joiner=str(MODEL/'joiner-epoch-99-avg-1.int8.onnx'), tokens=str(MODEL/'tokens.txt'), num_threads=4, sample_rate=RATE, feature_dim=80)

class Session:
    def __init__(self) -> None:
        if DIAGNOSTIC_WAV: OUT.mkdir(parents=True, exist_ok=True)
        self.stamp = time.strftime("%Y%m%d-%H%M%S")
        self.wav: dict[str, wave.Wave_write] = {}
        self.sequence = defaultdict(lambda: -1)
        self.started = time.monotonic()
        self.asr = recognizer() if MODEL.exists() else None
        self.audio = defaultdict(bytearray)
        self.last_partial = defaultdict(float)
        self.last_audio = defaultdict(time.monotonic)
        self.final_text = defaultdict(str)
        self.silence_samples = defaultdict(int)
        self.last_rejection = defaultdict(str)

    def write(self, speaker: str, data: bytes) -> None:
        if not DIAGNOSTIC_WAV: return
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

    def rejection_reason(self, speaker: str, text: str) -> str | None:
        compact = re.sub(r"\s+", "", text)
        if not compact: return "empty recognition result"
        if re.search(r"(.)\1{7,}", compact): return "repeated-character recognition result"
        if compact == re.sub(r"\s+", "", self.final_text[speaker]): return "duplicate final recognition result"
        return None

    async def report_rejection(self, websocket: WebSocket, speaker: str, text: str, reason: str) -> None:
        record("asr_rejected", speaker=speaker, reason=reason, text_length=len(text))
        key = f"{speaker}:{reason}"
        if self.last_rejection[speaker] != key:
            self.last_rejection[speaker] = key
            await websocket.send_json({"type":"diagnostic", "detail":f"ASR result rejected ({speaker}): {reason}"})

@app.get("/health")
def health() -> dict[str, Any]:
    process = psutil.Process()
    return {"status": "ok", "cpu_percent": process.cpu_percent(), "rss_bytes": process.memory_info().rss,
            "diagnostic_wav_enabled": DIAGNOSTIC_WAV, "model_available": MODEL.exists()}

@app.websocket("/ws")
async def ws(websocket: WebSocket) -> None:
    await websocket.accept(); session = Session(); header: dict[str, Any] | None = None
    record("session_start")
    try:
        while True:
            # An interview can contain a pause longer than 20 seconds. The
            # extension closes the socket explicitly when recording stops, so
            # do not discard the active transcription session during silence.
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                raise WebSocketDisconnect(message.get("code", 1000))
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
            if len(session.audio[speaker]) > MAX_BUFFER_BYTES:
                del session.audio[speaker][:-MAX_BUFFER_BYTES]
                await websocket.send_json({"type":"diagnostic", "detail":f"ASR buffer capped: {speaker}"})
            level = float(np.sqrt(np.mean(np.frombuffer(data, dtype=np.int16).astype(np.float32) ** 2)))
            # Use integer samples. Repeated 0.1-second floating point additions
            # can remain infinitesimally below 0.8 and prevent finalization.
            session.silence_samples[speaker] = session.silence_samples[speaker] + samples if level < 180 else 0
            buffered_seconds = len(session.audio[speaker]) / (RATE * WIDTH)
            if (buffered_seconds >= MIN_PARTIAL_AUDIO_SECONDS
                    and time.monotonic() - session.last_partial[speaker] >= PARTIAL_INTERVAL_SECONDS):
                started = time.monotonic(); text = await asyncio.wait_for(asyncio.to_thread(session.decode, speaker), timeout=5)
                record("partial_decode", speaker=speaker, elapsed_ms=round((time.monotonic()-started)*1000, 1), audio_seconds=round(len(session.audio[speaker])/(RATE*WIDTH), 3))
                session.last_partial[speaker] = time.monotonic()
                reason = session.rejection_reason(speaker, text)
                if reason: await session.report_rejection(websocket, speaker, text, reason)
                else:
                    session.last_rejection[speaker] = ""
                    await websocket.send_json({"type":"partial", "speaker":speaker, "text":text, "timestamp":time.strftime('%H:%M:%S')})
            if session.silence_samples[speaker] >= FINAL_SILENCE_SAMPLES and session.audio[speaker]:
                audio_seconds = len(session.audio[speaker]) / (RATE * WIDTH)
                if audio_seconds < MIN_FINAL_AUDIO_SECONDS:
                    session.audio[speaker].clear(); session.silence_samples[speaker] = 0
                    continue
                started = time.monotonic(); text = await asyncio.wait_for(asyncio.to_thread(session.decode, speaker), timeout=5)
                record("final_decode", speaker=speaker, elapsed_ms=round((time.monotonic()-started)*1000, 1), audio_seconds=round(len(session.audio[speaker])/(RATE*WIDTH), 3))
                reason = session.rejection_reason(speaker, text)
                if reason:
                    await session.report_rejection(websocket, speaker, text, reason)
                else:
                    session.last_rejection[speaker] = ""
                    session.final_text[speaker] = text
                    await websocket.send_json({"type":"final", "speaker":speaker, "text":text, "timestamp":time.strftime('%H:%M:%S')})
                session.audio[speaker].clear(); session.silence_samples[speaker] = 0
            if sequence % 100 == 0:
                process = psutil.Process(); elapsed = time.monotonic() - session.started
                logging.info("audio speaker=%s sequence=%d elapsed=%.1fs cpu=%.1f rss=%d", speaker, sequence, elapsed, process.cpu_percent(), process.memory_info().rss)
                await websocket.send_json({"type":"diagnostic", "detail":f"PCM verified: {speaker} seq={sequence}"})
    except WebSocketDisconnect: logging.info("client disconnected")
    except Exception as error:
        logging.exception("session error")
        if websocket.client_state == WebSocketState.CONNECTED:
            await websocket.send_json({"type":"diagnostic", "detail":f"server error: {error}"})
    finally: session.close()
    record("session_end", seconds=round(time.monotonic()-session.started, 3))
