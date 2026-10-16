# InterviewAI Transcriber

This local-first Chrome Manifest V3 extension captures Google Meet tab audio and the interviewer's microphone separately. It converts both to 16 kHz signed PCM, sends 100 ms framed audio over WebSocket, and performs Japanese recognition locally with the Apache-2.0 licensed ReazonSpeech Zipformer model through sherpa-onnx. The side panel distinguishes provisional and final results, and can export final results as TXT. Candidate audio and transcripts are not stored by the server.

## Run the diagnostic server

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r server/requirements.txt
python -m server.download_model
uvicorn server.main:app --host 127.0.0.1 --port 8765
```

`python -m server.download_model` downloads the model once (about 681 MB) to the ignored `server/models/` folder. It is not committed to GitHub.

## Build and load the extension

```bash
npm install
npm run typecheck
npm run build
```

The committed `dist/` folder is a ready-to-load build for Windows users who download the repository ZIP. Run the build only after changing the source files.

In `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist/`. With the Google Meet tab selected, click the extension's toolbar icon. This direct action starts Meet capture and opens the side panel. Click **マイクを許可**; a dedicated InterviewAI permission tab opens. Click its button and approve Chrome's prompt to capture interviewer audio. The server writes `diagnostics/audio/*-candidate.wav` and `*-interviewer.wav` while diagnostics are enabled. The side panel shows a speaker's newest provisional result with `…`; it becomes a timestamped final row after silence. **TXT 保存** exports final rows only.

WAV diagnostics are disabled by default so normal interview audio is not retained. To verify audio input during setup, start the server once with diagnostics explicitly enabled:

```bash
# Windows PowerShell
$env:INTERVIEWAI_DIAGNOSTIC_WAV = '1'; python -m uvicorn server.main:app --host 127.0.0.1 --port 8765
```

Close that PowerShell window and start the normal command again for real interviews.

## Local verification

With the local server running and the model downloaded, run the protocol check in a second terminal:

```bash
python -m server.e2e_test
```

It sends the model's Japanese test audio using the same WebSocket format as the extension and checks that both a partial and a final result are returned. For a duration-test summary, run `python -m server.report_metrics` after a session.

## Current acceptance checks

* Both WAV files are mono, 16 kHz, 16-bit PCM and contain the intended separate source.
* Candidate audio remains audible in Meet while capture is running (the tab stream is routed back to the AudioContext destination once, while microphone monitoring remains muted).
* Server logs per-source frame sequence numbers, queue overflow, CPU/RSS, recognition timing, and protocol errors.
* `python -m server.e2e_test` returns a provisional and final Japanese result for the included model test audio.

The current recognizer re-decodes the active speech segment once per second for provisional results and finalizes after 0.8 seconds of silence. It is a bounded incremental approach, not a native streaming model: production readiness still requires 10, 30, and 60 minute measurements with real Meet audio.
