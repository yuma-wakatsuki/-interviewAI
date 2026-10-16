# InterviewAI Transcriber — Phase 1

This is a diagnostic MVP for a Chrome Manifest V3 extension. It captures Google Meet tab audio and the interviewer's microphone separately, converts both to 16 kHz signed PCM, sends framed audio over WebSocket, and writes separate WAV files for inspection. It does not yet perform speech recognition or persist transcripts.

## Run the diagnostic server

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r server/requirements.txt
uvicorn server.main:app --host 127.0.0.1 --port 8765
```

## Build and load the extension

```bash
npm install
npm run typecheck
npm run build
```

In `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist/`. With the Google Meet tab selected, click the extension's toolbar icon. This direct action starts capture and opens the side panel; grant microphone permission. The server writes `diagnostics/audio/*-candidate.wav` and `*-interviewer.wav`.

## Phase 1 acceptance checks

* Both WAV files are mono, 16 kHz, 16-bit PCM and contain the intended separate source.
* Candidate audio remains audible in Meet while capture is running (the tab stream is routed back to the AudioContext destination once, while microphone monitoring remains muted).
* Server logs monotonically increasing per-source frame sequence numbers, queue overflow, CPU/RSS, and protocol errors.

`sherpa-onnx` ASR and VAD are deliberately not included until a Japanese streaming model's measured latency/accuracy and the exact model license are recorded.
