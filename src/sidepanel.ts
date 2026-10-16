export {};
type TranscriptEntry = { speaker?: string; text?: string; timestamp?: string; detail?: string; type: string };
const statusEl = document.querySelector('#status')!;
const transcript = document.querySelector('#transcript')!;
const start = document.querySelector<HTMLButtonElement>('#start')!;
const grantMic = document.querySelector<HTMLButtonElement>('#grant-mic')!;
const stopButton = document.querySelector<HTMLButtonElement>('#stop')!;
const entries: TranscriptEntry[] = [];
function render() { transcript.textContent = entries.map(e => e.type === 'diagnostic' ? `[診断] ${e.detail}` : `[${e.timestamp ?? ''}] ${e.speaker}: ${e.text}${e.type === 'partial' ? ' …' : ''}`).join('\n'); }
chrome.runtime.onMessage.addListener((event: TranscriptEntry) => {
  entries.push(event); render();
  if (event.type === 'diagnostic' && event.detail?.includes('Meet audio capture started')) statusEl.textContent = 'Meet 音声を録音中です。次に「マイクを許可」を押してください。';
  if (event.type === 'diagnostic' && event.detail?.includes('Interviewer microphone capture started')) statusEl.textContent = 'Meet 音声とマイクを録音中です。';
  if (event.type === 'diagnostic' && event.detail?.includes('Capture stopped')) statusEl.textContent = '停止しました。';
});
start.onclick = async () => {
  statusEl.textContent = 'Google Meet のタブを選び、Chrome右上の拡張機能アイコンをクリックして開始してください。';
};
grantMic.onclick = async () => {
  try {
    // Request permission in the visible panel, where Chrome can display its
    // consent prompt. Offscreen then opens its own stream using that grant.
    const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    permissionStream.getTracks().forEach(track => track.stop());
    const result = await chrome.runtime.sendMessage({ type: 'offscreen-start-mic' });
    statusEl.textContent = result.ok ? 'マイクを接続しています。' : `マイク開始失敗: ${result.error}`;
  } catch (error) { statusEl.textContent = `マイク許可失敗: ${String(error)}`; }
};
stopButton.onclick = async () => {
  await chrome.runtime.sendMessage({ type: 'offscreen-stop' });
  statusEl.textContent = '停止しました';
};
document.querySelector('#export')!.addEventListener('click', () => { const content = entries.filter(e => e.type === 'final').map(e => `[${e.timestamp}] ${e.speaker}: ${e.text}`).join('\n'); const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' })); const a = Object.assign(document.createElement('a'), { href: url, download: `interview-${new Date().toISOString()}.txt` }); a.click(); URL.revokeObjectURL(url); });
