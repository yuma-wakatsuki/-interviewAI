chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

async function ensureOffscreen() {
  const contexts = await new Promise<chrome.runtime.ExtensionContext[]>(resolve =>
    chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType] }, resolve));
  if (!contexts.length) await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: [chrome.offscreen.Reason.USER_MEDIA], justification: 'Capture and process interview audio in AudioWorklet' });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'start') {
    (async () => {
      await ensureOffscreen();
      const targetTabId = sender.tab?.id ?? message.tabId;
      if (!targetTabId) throw new Error('対象タブを特定できません。Google Meet タブから開始してください。');
      const streamId = await new Promise<string>((resolve, reject) =>
        chrome.tabCapture.getMediaStreamId({ targetTabId }, id => {
          const error = chrome.runtime.lastError;
          if (error) reject(new Error(error.message)); else resolve(id);
        }));
      await chrome.runtime.sendMessage({ type: 'offscreen-start', streamId });
      sendResponse({ ok: true });
    })().catch(error => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
  if (message.type === 'stop') chrome.runtime.sendMessage({ type: 'offscreen-stop' }).then(() => sendResponse({ ok: true }));
  return message.type === 'stop';
});
