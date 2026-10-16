// Capturing a tab requires a direct extension-action gesture.  Opening a side
// panel first and asking it to capture later loses that grant in Chrome.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(console.error);

async function ensureOffscreen() {
  const contexts = await new Promise<chrome.runtime.ExtensionContext[]>(resolve =>
    chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType] }, resolve));
  if (!contexts.length) await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: [chrome.offscreen.Reason.USER_MEDIA], justification: 'Capture and process interview audio in AudioWorklet' });
}

async function checkLocalServer() {
  let response: Response;
  try {
    response = await fetch('http://127.0.0.1:8765/health');
  } catch {
    throw new Error('ローカル認識サーバーに接続できません。PowerShell で scripts\\start_windows.ps1 を起動してから、もう一度お試しください。');
  }
  if (!response.ok) throw new Error('ローカル認識サーバーの状態確認に失敗しました。');
  const health = await response.json() as { model_available?: boolean };
  if (!health.model_available) throw new Error('日本語認識モデルが準備されていません。scripts\\start_windows.ps1 を再実行してください。');
}

async function startFromAction(tab: chrome.tabs.Tab) {
  if (!tab.id) throw new Error('Google Meet のタブを選んでから拡張機能アイコンをクリックしてください。');
  await checkLocalServer();
  // A toolbar click begins a new interview capture. Final rows are stored in
  // session storage so closing the side panel does not lose them, but must not
  // leak into the next interview.
  await chrome.storage.session.set({ transcriptEntries: [] });
  chrome.runtime.sendMessage({ type: 'transcript-reset' }).catch(() => undefined);
  const streamId = await new Promise<string>((resolve, reject) =>
    chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id! }, id => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message)); else resolve(id);
    }));
  await ensureOffscreen();
  const result = await chrome.runtime.sendMessage({ type: 'offscreen-start', streamId });
  if (!result?.ok) throw new Error(result?.error ?? '音声取得を開始できませんでした。');
}

chrome.action.onClicked.addListener(tab => {
  // sidePanel.open must run immediately within the toolbar-click gesture.
  // Awaiting tab capture first makes Chrome reject the panel request.
  if (tab.id) chrome.sidePanel.open({ tabId: tab.id }).catch(() => undefined);
  startFromAction(tab).catch(async error => {
    chrome.runtime.sendMessage({ type: 'diagnostic', detail: `開始失敗: ${String(error)}` }).catch(() => undefined);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'start') {
    sendResponse({ ok: false, error: 'Google Meet のタブを選び、Chrome右上の拡張機能アイコンをクリックして開始してください。' });
    return false;
  }
  if (message.type === 'stop') chrome.runtime.sendMessage({ type: 'offscreen-stop' }).then(() => sendResponse({ ok: true }));
  return message.type === 'stop';
});
