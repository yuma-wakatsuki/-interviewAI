# InterviewAI Transcriber — Phase 1

This is a diagnostic MVP for a Chrome Manifest V3 extension. It captures Google Meet tab audio and the interviewer's microphone separately, converts both to 16 kHz signed PCM, sends framed audio over WebSocket, and writes separate WAV files for inspection. A WAV is created only after that source delivers audio. It does not yet perform speech recognition or persist transcripts.

## Run the diagnostic server

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r server/requirements.txt
python -m server.download_model
uvicorn server.main:app --host 127.0.0.1 --port 8765
```

## Build and load the extension

```bash
npm install
npm run typecheck
npm run build
```

The committed `dist/` folder is a ready-to-load build for Windows users who download the repository ZIP. Run the build only after changing the source files.

In `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist/`. With the Google Meet tab selected, click the extension's toolbar icon. This direct action starts Meet capture and opens the side panel. Click **マイクを許可**; a dedicated InterviewAI permission tab opens. Click its button and approve Chrome's prompt to capture interviewer audio. The server writes `diagnostics/audio/*-candidate.wav` and `*-interviewer.wav`.

## Phase 1 acceptance checks

* Both WAV files are mono, 16 kHz, 16-bit PCM and contain the intended separate source.
* Candidate audio remains audible in Meet while capture is running (the tab stream is routed back to the AudioContext destination once, while microphone monitoring remains muted).
* Server logs monotonically increasing per-source frame sequence numbers, queue overflow, CPU/RSS, and protocol errors.

`sherpa-onnx` ASR and VAD are deliberately not included until a Japanese streaming model's measured latency/accuracy and the exact model license are recorded.
