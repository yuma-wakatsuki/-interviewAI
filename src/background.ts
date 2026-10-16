chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

async function ensureOffscreen() {
  const contexts = await new Promise<chrome.runtime.ExtensionContext[]>(resolve =>
    chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType] }, resolve));
  if (!contexts.length) await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: [chrome.offscreen.Reason.USER_MEDIA], justification: 'Capture and process interview audio in AudioWorklet' });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'start') {
    (async () => {
      await ensureOffscreen();
      if (!message.streamId) throw new Error('Meet タブの音声取得 ID がありません。Meet タブで開始してください。');
      await chrome.runtime.sendMessage({ type: 'offscreen-start', streamId: message.streamId });
      sendResponse({ ok: true });
    })().catch(error => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
  if (message.type === 'stop') chrome.runtime.sendMessage({ type: 'offscreen-stop' }).then(() => sendResponse({ ok: true }));
  return message.type === 'stop';
});
