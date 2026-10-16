// src/background.ts
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(console.error);
async function ensureOffscreen() {
  const contexts = await new Promise((resolve) => chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] }, resolve));
  if (!contexts.length) await chrome.offscreen.createDocument({ url: "offscreen.html", reasons: [chrome.offscreen.Reason.USER_MEDIA], justification: "Capture and process interview audio in AudioWorklet" });
}
async function checkLocalServer() {
  let response;
  try {
    response = await fetch("http://127.0.0.1:8765/health");
  } catch {
    throw new Error("\u30ED\u30FC\u30AB\u30EB\u8A8D\u8B58\u30B5\u30FC\u30D0\u30FC\u306B\u63A5\u7D9A\u3067\u304D\u307E\u305B\u3093\u3002PowerShell \u3067 scripts\\start_windows.ps1 \u3092\u8D77\u52D5\u3057\u3066\u304B\u3089\u3001\u3082\u3046\u4E00\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002");
  }
  if (!response.ok) throw new Error("\u30ED\u30FC\u30AB\u30EB\u8A8D\u8B58\u30B5\u30FC\u30D0\u30FC\u306E\u72B6\u614B\u78BA\u8A8D\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002");
  const health = await response.json();
  if (!health.model_available) throw new Error("\u65E5\u672C\u8A9E\u8A8D\u8B58\u30E2\u30C7\u30EB\u304C\u6E96\u5099\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002scripts\\start_windows.ps1 \u3092\u518D\u5B9F\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
}
async function startFromAction(tab) {
  if (!tab.id) throw new Error("Google Meet \u306E\u30BF\u30D6\u3092\u9078\u3093\u3067\u304B\u3089\u62E1\u5F35\u6A5F\u80FD\u30A2\u30A4\u30B3\u30F3\u3092\u30AF\u30EA\u30C3\u30AF\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
  await checkLocalServer();
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
