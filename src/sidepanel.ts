export {};
type TranscriptEntry = { speaker?: string; text?: string; timestamp?: string; detail?: string; type: string };
const statusEl = document.querySelector('#status')!;
const transcript = document.querySelector('#transcript')!;
const diagnosticsEl = document.querySelector('#diagnostics')!;
const start = document.querySelector<HTMLButtonElement>('#start')!;
const grantMic = document.querySelector<HTMLButtonElement>('#grant-mic')!;
const stopButton = document.querySelector<HTMLButtonElement>('#stop')!;
let entries: TranscriptEntry[] = [];
const partials = new Map<string, TranscriptEntry>();
const diagnostics: string[] = [];
function speakerLabel(speaker?: string) {
  return speaker === 'interviewer' ? '面接官' : speaker === 'candidate' ? '候補者' : speaker ?? '';
}
async function refreshServerStatus() {
  try {
    const response = await fetch('http://127.0.0.1:8765/health');
    const health = await response.json() as { status?: string; model_available?: boolean };
    if (health.status === 'ok' && health.model_available) {
      statusEl.textContent = 'ローカル認識サーバーの準備ができました。Meet タブで拡張機能アイコンをクリックしてください。';
    } else {
      statusEl.textContent = '日本語認識モデルの準備ができていません。scripts\\start_windows.ps1 を実行してください。';
    }
  } catch {
    statusEl.textContent = 'ローカル認識サーバーが起動していません。scripts\\start_windows.ps1 を実行してください。';
  }
}
async function saveFinalEntries() {
  await chrome.storage.session.set({ transcriptEntries: entries.filter(e => e.type === 'final') });
}
async function restoreFinalEntries() {
  const stored = await chrome.storage.session.get('transcriptEntries');
  if (Array.isArray(stored.transcriptEntries)) {
    entries = stored.transcriptEntries.filter((entry: unknown): entry is TranscriptEntry =>
      typeof entry === 'object' && entry !== null && (entry as TranscriptEntry).type === 'final');
    render();
  }
}
void restoreFinalEntries();
void refreshServerStatus();
function render() {
  const finalRows = entries.filter(e => e.type === 'final');
  transcript.textContent = [...finalRows, ...partials.values()].map(e =>
    e.type === 'partial'
      ? `${speakerLabel(e.speaker)}: ${e.text} …`
      : `[${e.timestamp ?? ''}] ${speakerLabel(e.speaker)}: ${e.text}`).join('\n');
}
function renderDiagnostics() { diagnosticsEl.textContent = diagnostics.map(detail => `[診断] ${detail}`).join('\n'); }
chrome.runtime.onMessage.addListener((event: TranscriptEntry) => {
  if (!event.type) return;
  if (event.type === 'transcript-reset') {
    entries = [];
    partials.clear();
    void saveFinalEntries();
    render();
    return;
  }
  if (event.type === 'partial' && event.speaker) partials.set(event.speaker, event);
  else {
    if (event.type === 'final' && event.speaker) {
      partials.delete(event.speaker);
      entries.push(event);
      void saveFinalEntries();
    }
  }
  if (event.type === 'diagnostic' && event.detail) {
    diagnostics.push(event.detail); if (diagnostics.length > 20) diagnostics.shift();
    renderDiagnostics();
  }
  render();
  if (event.type === 'diagnostic' && event.detail?.includes('WebSocket connected')) statusEl.textContent = 'ローカル認識サーバーへ接続しました。';
  if (event.type === 'diagnostic' && event.detail?.includes('Meet audio capture started')) statusEl.textContent = 'Meet 音声を録音中です。次に「マイクを許可」を押してください。';
  if (event.type === 'diagnostic' && event.detail?.includes('Interviewer microphone capture started')) statusEl.textContent = 'Meet 音声とマイクを録音中です。';
  if (event.type === 'diagnostic' && event.detail?.includes('Capture stopped')) statusEl.textContent = '停止しました。';
  if (event.type === 'diagnostic' && event.detail?.includes('queue overflow')) statusEl.textContent = '音声処理が追いついていません。診断ログを確認してください。';
  if (event.type === 'diagnostic' && event.detail?.includes('WebSocket disconnected')) statusEl.textContent = 'ローカル認識サーバーへの再接続を試みています。';
  if (event.type === 'diagnostic' && event.detail?.includes('server error')) statusEl.textContent = '認識サーバーでエラーが発生しました。診断ログを確認してください。';
});
start.onclick = async () => {
  statusEl.textContent = 'Google Meet のタブを選び、Chrome右上の拡張機能アイコンをクリックして開始してください。';
};
grantMic.onclick = async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL('microphone.html') });
  statusEl.textContent = '開いた「InterviewAI のマイク許可」タブで、マイクを許可してください。';
};
stopButton.onclick = async () => {
  await chrome.runtime.sendMessage({ type: 'offscreen-stop' });
  statusEl.textContent = '停止しました';
};
document.querySelector('#export')!.addEventListener('click', () => { const rows = entries.filter(e => e.type === 'final'); const content = [`InterviewAI transcript`, `Exported: ${new Date().toLocaleString('ja-JP')}`, '', ...rows.map(e => `[${e.timestamp}] ${speakerLabel(e.speaker)}: ${e.text}`)].join('\n'); const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' })); const a = Object.assign(document.createElement('a'), { href: url, download: `interview-${new Date().toISOString()}.txt` }); a.click(); URL.revokeObjectURL(url); });
