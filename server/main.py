"""Phase 1 diagnostic server: validates PCM frames and writes separate WAV files; no transcript is persisted."""
import asyncio, json, logging, struct, time, wave
from collections import defaultdict
from pathlib import Path
from typing import Any
import psutil
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
app = FastAPI()
OUT = Path("diagnostics/audio")
RATE, CHANNELS, WIDTH = 16_000, 1, 2

class Session:
    def __init__(self) -> None:
        OUT.mkdir(parents=True, exist_ok=True)
        stamp = time.strftime("%Y%m%d-%H%M%S")
        self.wav = {speaker: wave.open(str(OUT / f"{stamp}-{speaker}.wav"), "wb") for speaker in ("candidate", "interviewer")}
        for writer in self.wav.values(): writer.setparams((CHANNELS, WIDTH, RATE, 0, "NONE", "not compressed"))
        self.sequence = defaultdict(lambda: -1)
        self.started = time.monotonic()
    def close(self) -> None:
        for writer in self.wav.values(): writer.close()

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
            if speaker not in session.wav or header.get("sampleRate") != RATE or len(data) != samples * WIDTH: raise ValueError(f"invalid frame: {header}")
            if sequence <= session.sequence[speaker]: logging.warning("non-monotonic sequence speaker=%s sequence=%s", speaker, sequence)
            session.sequence[speaker] = sequence; session.wav[speaker].writeframesraw(data)
            if sequence % 100 == 0:
                process = psutil.Process(); elapsed = time.monotonic() - session.started
                logging.info("audio speaker=%s sequence=%d elapsed=%.1fs cpu=%.1f rss=%d", speaker, sequence, elapsed, process.cpu_percent(), process.memory_info().rss)
                await websocket.send_json({"type":"diagnostic", "detail":f"PCM verified: {speaker} seq={sequence}"})
    except (WebSocketDisconnect, asyncio.TimeoutError): logging.info("client disconnected or timed out")
    except Exception as error:
        logging.exception("session error")
        await websocket.send_json({"type":"diagnostic", "detail":f"server error: {error}"})
    finally: session.close()
