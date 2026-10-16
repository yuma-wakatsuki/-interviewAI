export {};

const button = document.querySelector<HTMLButtonElement>('#grant')!;
const status = document.querySelector('#status')!;

button.onclick = async () => {
  button.disabled = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    stream.getTracks().forEach(track => track.stop());
    const result = await chrome.runtime.sendMessage({ type: 'offscreen-start-mic' });
    if (!result?.ok) throw new Error(result?.error ?? 'マイク取得を開始できませんでした。');
    status.textContent = 'マイクを許可しました。このタブは閉じて構いません。';
  } catch (error) {
    status.textContent = `マイクの許可に失敗しました: ${String(error)}`;
    button.disabled = false;
  }
};
