export {};
type TranscriptEntry = { speaker?: string; text?: string; timestamp?: string; detail?: string; type: string };
const statusEl = document.querySelector('#status')!;
const transcript = document.querySelector('#transcript')!;
const start = document.querySelector<HTMLButtonElement>('#start')!;
const stopButton = document.querySelector<HTMLButtonElement>('#stop')!;
const entries: TranscriptEntry[] = [];
function render() { transcript.textContent = entries.map(e => e.type === 'diagnostic' ? `[診断] ${e.detail}` : `[${e.timestamp ?? ''}] ${e.speaker}: ${e.text}${e.type === 'partial' ? ' …' : ''}`).join('\n'); }
chrome.runtime.onMessage.addListener((event: TranscriptEntry) => { entries.push(event); render(); });
start.onclick = async () => {
  statusEl.textContent = 'Google Meet のタブを選び、Chrome右上の拡張機能アイコンをクリックして開始してください。';
};
stopButton.onclick = async () => { await chrome.runtime.sendMessage({ type: 'stop' }); statusEl.textContent = '停止しました'; start.disabled = false; stopButton.disabled = true; };
document.querySelector('#export')!.addEventListener('click', () => { const content = entries.filter(e => e.type === 'final').map(e => `[${e.timestamp}] ${e.speaker}: ${e.text}`).join('\n'); const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' })); const a = Object.assign(document.createElement('a'), { href: url, download: `interview-${new Date().toISOString()}.txt` }); a.click(); URL.revokeObjectURL(url); });
