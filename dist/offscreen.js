// src/offscreen.ts
var streams = [];
var audioContexts = [];
var socket;
var sequence = 0;
var microphoneAttached = false;
var pending = [];
var targetRate = 16e3;
function emit(message) {
  chrome.runtime.sendMessage(message).catch(() => void 0);
}
function connect() {
  if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
  socket = new WebSocket("ws://127.0.0.1:8765/ws");
  socket.onopen = () => {
    emit({ type: "diagnostic", detail: "WebSocket connected" });
    flush();
  };
  socket.onmessage = (event) => emit(JSON.parse(event.data));
  socket.onclose = () => {
    emit({ type: "diagnostic", detail: "WebSocket disconnected; retrying" });
    setTimeout(connect, 1e3);
  };
  socket.onerror = () => emit({ type: "diagnostic", detail: "WebSocket error" });
}
function flush() {
  while (socket?.readyState === WebSocket.OPEN && pending.length) {
    const item = pending.shift();
    const header = JSON.stringify({ type: "audio", speaker: item.speaker, sequence: sequence++, sampleRate: targetRate, samples: item.pcm.length });
    socket.send(JSON.stringify({ type: "header", header }));
    socket.send(item.pcm.buffer);
  }
}
function downsample(input, sourceRate) {
  const ratio = sourceRate / targetRate;
  const count = Math.floor(input.length / ratio);
  const out = new Int16Array(count);
  for (let i = 0; i < count; i++) {
    const start2 = Math.floor(i * ratio), end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start2; j < end; j++) sum += input[j];
    out[i] = Math.max(-1, Math.min(1, sum / Math.max(1, end - start2))) * 32767;
  }
  return out;
}
async function attach(stream, speaker, monitor) {
  const context = new AudioContext();
  audioContexts.push(context);
  await context.audioWorklet.addModule(chrome.runtime.getURL("audio-worklet.js"));
  const source = context.createMediaStreamSource(stream);
  const worklet = new AudioWorkletNode(context, "pcm-processor");
  source.connect(worklet);
  if (monitor) {
    source.connect(context.destination);
  } else {
    const silent = context.createGain();
    silent.gain.value = 0;
    worklet.connect(silent).connect(context.destination);
  }
  worklet.port.onmessage = ({ data }) => {
    pending.push({ speaker, pcm: downsample(new Float32Array(data), context.sampleRate) });
    if (pending.length > 250) {
      pending.shift();
      emit({ type: "diagnostic", detail: "audio queue overflow: oldest frame dropped" });
    }
    flush();
  };
  streams.push(stream);
}
async function start(streamId) {
  connect();
  const tabStream = await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId } }, video: false });
  await attach(tabStream, "candidate", true);
  emit({ type: "diagnostic", detail: "Meet audio capture started. Click \u300C\u30DE\u30A4\u30AF\u3092\u8A31\u53EF\u300D to capture interviewer audio." });
}
async function startMicrophone() {
  if (microphoneAttached) return;
  const micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
  await attach(micStream, "interviewer", false);
  microphoneAttached = true;
  emit({ type: "diagnostic", detail: "Interviewer microphone capture started." });
}
function stop() {
  streams.flatMap((s) => s.getTracks()).forEach((t) => t.stop());
  streams = [];
  audioContexts.forEach((context) => context.close().catch(() => void 0));
  audioContexts = [];
  microphoneAttached = false;
  socket?.close();
  socket = void 0;
  emit({ type: "diagnostic", detail: "Capture stopped." });
}
chrome.runtime.onMessage.addListener((m, _, sendResponse) => {
  if (m.type === "offscreen-start") start(m.streamId).then(() => sendResponse({ ok: true })).catch((e) => sendResponse({ ok: false, error: String(e) }));
  if (m.type === "offscreen-start-mic") startMicrophone().then(() => sendResponse({ ok: true })).catch((e) => sendResponse({ ok: false, error: String(e) }));
  if (m.type === "offscreen-stop") {
    stop();
    sendResponse({ ok: true });
  }
  return true;
});
