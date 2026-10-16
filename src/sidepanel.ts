export {};
type TranscriptEntry = { speaker?: string; text?: string; timestamp?: string; detail?: string; type: string };
const statusEl = document.querySelector('#status')!;
const transcript = document.querySelector('#transcript')!;
const start = document.querySelector<HTMLButtonElement>('#start')!;
const grantMic = document.querySelector<HTMLButtonElement>('#grant-mic')!;
const stopButton = document.querySelector<HTMLButtonElement>('#stop')!;
const entries: TranscriptEntry[] = [];
const partials = new Map<string, TranscriptEntry>();
function render() {
  const finalRows = entries.filter(e => e.type === 'final');
  transcript.textContent = [...partials.values(), ...finalRows].map(e => e.type === 'partial' ? `${e.speaker}: ${e.text} …` : `[${e.timestamp ?? ''}] ${e.speaker}: ${e.text}`).join('\n');
}
chrome.runtime.onMessage.addListener((event: TranscriptEntry) => {
  if (!event.type) return;
  if (event.type === 'partial' && event.speaker) partials.set(event.speaker, event);
  else { if (event.type === 'final' && event.speaker) partials.delete(event.speaker); entries.push(event); }
  render();
  if (event.type === 'diagnostic' && event.detail?.includes('Meet audio capture started')) statusEl.textContent = 'Meet 音声を録音中です。次に「マイクを許可」を押してください。';
  if (event.type === 'diagnostic' && event.detail?.includes('Interviewer microphone capture started')) statusEl.textContent = 'Meet 音声とマイクを録音中です。';
  if (event.type === 'diagnostic' && event.detail?.includes('Capture stopped')) statusEl.textContent = '停止しました。';
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
document.querySelector('#export')!.addEventListener('click', () => { const content = entries.filter(e => e.type === 'final').map(e => `[${e.timestamp}] ${e.speaker}: ${e.text}`).join('\n'); const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' })); const a = Object.assign(document.createElement('a'), { href: url, download: `interview-${new Date().toISOString()}.txt` }); a.click(); URL.revokeObjectURL(url); });
