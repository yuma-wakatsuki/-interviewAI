// Capturing a tab requires a direct extension-action gesture.  Opening a side
// panel first and asking it to capture later loses that grant in Chrome.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(console.error);

async function ensureOffscreen() {
  const contexts = await new Promise<chrome.runtime.ExtensionContext[]>(resolve =>
    chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType] }, resolve));
  if (!contexts.length) await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: [chrome.offscreen.Reason.USER_MEDIA], justification: 'Capture and process interview audio in AudioWorklet' });
}

async function startFromAction(tab: chrome.tabs.Tab) {
  if (!tab.id) throw new Error('Google Meet のタブを選んでから拡張機能アイコンをクリックしてください。');
  const streamId = await new Promise<string>((resolve, reject) =>
    chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id! }, id => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message)); else resolve(id);
    }));
  await ensureOffscreen();
  const result = await chrome.runtime.sendMessage({ type: 'offscreen-start', streamId });
  if (!result?.ok) throw new Error(result?.error ?? '音声取得を開始できませんでした。');
  await chrome.sidePanel.open({ tabId: tab.id });
}

chrome.action.onClicked.addListener(tab => {
  startFromAction(tab).catch(async error => {
    if (tab.id) await chrome.sidePanel.open({ tabId: tab.id }).catch(() => undefined);
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
