// src/background.ts
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(console.error);
async function ensureOffscreen() {
  const contexts = await new Promise((resolve) => chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] }, resolve));
  if (!contexts.length) await chrome.offscreen.createDocument({ url: "offscreen.html", reasons: [chrome.offscreen.Reason.USER_MEDIA], justification: "Capture and process interview audio in AudioWorklet" });
}
async function startFromAction(tab) {
  if (!tab.id) throw new Error("Google Meet \u306E\u30BF\u30D6\u3092\u9078\u3093\u3067\u304B\u3089\u62E1\u5F35\u6A5F\u80FD\u30A2\u30A4\u30B3\u30F3\u3092\u30AF\u30EA\u30C3\u30AF\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
  const streamId = await new Promise((resolve, reject) => chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, (id) => {
    const error = chrome.runtime.lastError;
    if (error) reject(new Error(error.message));
    else resolve(id);
  }));
  await ensureOffscreen();
  const result = await chrome.runtime.sendMessage({ type: "offscreen-start", streamId });
  if (!result?.ok) throw new Error(result?.error ?? "\u97F3\u58F0\u53D6\u5F97\u3092\u958B\u59CB\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002");
}
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) chrome.sidePanel.open({ tabId: tab.id }).catch(() => void 0);
  startFromAction(tab).catch(async (error) => {
    chrome.runtime.sendMessage({ type: "diagnostic", detail: `\u958B\u59CB\u5931\u6557: ${String(error)}` }).catch(() => void 0);
  });
});
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "start") {
    sendResponse({ ok: false, error: "Google Meet \u306E\u30BF\u30D6\u3092\u9078\u3073\u3001Chrome\u53F3\u4E0A\u306E\u62E1\u5F35\u6A5F\u80FD\u30A2\u30A4\u30B3\u30F3\u3092\u30AF\u30EA\u30C3\u30AF\u3057\u3066\u958B\u59CB\u3057\u3066\u304F\u3060\u3055\u3044\u3002" });
    return false;
  }
  if (message.type === "stop") chrome.runtime.sendMessage({ type: "offscreen-stop" }).then(() => sendResponse({ ok: true }));
  return message.type === "stop";
});
