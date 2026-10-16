import type { Speaker } from './protocol';

let streams: MediaStream[] = [];
let audioContexts: AudioContext[] = [];
let socket: WebSocket | undefined;
let sequence = 0;
let microphoneAttached = false;
let reconnectEnabled = false;
let lastQueueWarningAt = 0;
let reconnectAttempts = 0;
const pending: { speaker: Speaker; pcm: Int16Array }[] = [];
const targetRate = 16000;
// AudioWorklet normally emits a few milliseconds at a time. Sending every
// callback as an individual WebSocket message overwhelms the browser and the
// local server long before an interview ends. Keep end-to-end latency low
// while reducing message volume to ten packets per second per source.
const packetSamples = targetRate / 10;

function emit(message: unknown) { chrome.runtime.sendMessage(message).catch(() => undefined); }
function connect() {
  if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
  socket = new WebSocket('ws://127.0.0.1:8765/ws');
  socket.onopen = () => { reconnectAttempts = 0; emit({ type: 'diagnostic', detail: 'WebSocket connected' }); flush(); };
  socket.onmessage = event => emit(JSON.parse(event.data));
  socket.onclose = () => {
    if (!reconnectEnabled) return;
    const delay = Math.min(1000 * 2 ** reconnectAttempts, 10000);
    reconnectAttempts += 1;
    emit({ type: 'diagnostic', detail: `WebSocket disconnected; retrying in ${delay / 1000}s` });
    setTimeout(() => { if (reconnectEnabled) connect(); }, delay);
  };
  socket.onerror = () => emit({ type: 'diagnostic', detail: 'WebSocket error' });
}
function flush() {
  while (socket?.readyState === WebSocket.OPEN && pending.length) {
    const item = pending.shift()!;
    const header = JSON.stringify({ type: 'audio', speaker: item.speaker, sequence: sequence++, sampleRate: targetRate, samples: item.pcm.length });
    socket.send(JSON.stringify({ type: 'header', header }));
    socket.send(item.pcm.buffer);
  }
}
function downsample(input: Float32Array, sourceRate: number): Int16Array {
  const ratio = sourceRate / targetRate;
  const count = Math.floor(input.length / ratio);
  const out = new Int16Array(count);
  for (let i = 0; i < count; i++) {
    const start = Math.floor(i * ratio), end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0; for (let j = start; j < end; j++) sum += input[j];
    out[i] = Math.max(-1, Math.min(1, sum / Math.max(1, end - start))) * 0x7fff;
  }
  return out;
}
async function attach(stream: MediaStream, speaker: Speaker, monitor: boolean) {
  const context = new AudioContext();
  audioContexts.push(context);
  await context.audioWorklet.addModule(chrome.runtime.getURL('audio-worklet.js'));
  const source = context.createMediaStreamSource(stream);
  const worklet = new AudioWorkletNode(context, 'pcm-processor');
  let buffered = new Int16Array(0);
  source.connect(worklet);
  if (monitor) {
    // Chrome stops rendering an audio tab when it is captured.  Send only the
    // Meet source back to the destination so the interviewer still hears it.
    source.connect(context.destination);
  } else {
    // Keep the microphone worklet alive without returning the interviewer's
    // own voice through the speakers.
    const silent = context.createGain(); silent.gain.value = 0;
    worklet.connect(silent).connect(context.destination);
  }
  worklet.port.onmessage = ({ data }) => {
    const next = downsample(new Float32Array(data), context.sampleRate);
    const combined = new Int16Array(buffered.length + next.length);
    combined.set(buffered); combined.set(next, buffered.length);
    buffered = combined;
    while (buffered.length >= packetSamples) {
      pending.push({ speaker, pcm: buffered.slice(0, packetSamples) });
      buffered = buffered.slice(packetSamples);
    }
    // At 100 ms per packet this is a 25-second ceiling. Preserve recent audio
    // and make the loss visible instead of silently accumulating memory.
    if (pending.length > 250) {
      pending.shift();
      if (Date.now() - lastQueueWarningAt >= 5000) {
        lastQueueWarningAt = Date.now();
        emit({ type: 'diagnostic', detail: 'audio queue overflow: oldest packet dropped' });
      }
    }
    flush();
  };
  streams.push(stream);
}
async function start(streamId: string) {
  reconnectEnabled = true;
  connect();
  const tabStream = await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } } as MediaTrackConstraints, video: false });
  await attach(tabStream, 'candidate', true);
  emit({ type: 'diagnostic', detail: 'Meet audio capture started. Click 「マイクを許可」 to capture interviewer audio.' });
}
async function startMicrophone() {
  if (microphoneAttached) return;
  const micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
  await attach(micStream, 'interviewer', false);
  microphoneAttached = true;
  emit({ type: 'diagnostic', detail: 'Interviewer microphone capture started.' });
}
function stop() {
  reconnectEnabled = false;
  reconnectAttempts = 0;
  streams.flatMap(s => s.getTracks()).forEach(t => t.stop());
  streams = [];
  audioContexts.forEach(context => context.close().catch(() => undefined));
  audioContexts = [];
  microphoneAttached = false;
  pending.length = 0;
  sequence = 0;
  lastQueueWarningAt = 0;
  socket?.close(); socket = undefined;
  emit({ type: 'diagnostic', detail: 'Capture stopped.' });
}
chrome.runtime.onMessage.addListener((m, _, sendResponse) => { if (m.type === 'offscreen-start') start(m.streamId).then(() => sendResponse({ ok: true })).catch(e => sendResponse({ ok: false, error: String(e) })); if (m.type === 'offscreen-start-mic') startMicrophone().then(() => sendResponse({ ok: true })).catch(e => sendResponse({ ok: false, error: String(e) })); if (m.type === 'offscreen-stop') { stop(); sendResponse({ ok: true }); } return true; });
