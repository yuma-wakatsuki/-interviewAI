// src/background.ts
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(console.error);
var NATIVE_HOST_NAME = "com.interviewai.transcriber";
var nativePort;
var nativeRequestSequence = 0;
var nativeRequests = /* @__PURE__ */ new Map();
function getNativePort() {
  if (nativePort) return nativePort;
  nativePort = chrome.runtime.connectNative(NATIVE_HOST_NAME);
  nativePort.onMessage.addListener((message) => {
    if (typeof message.id !== "number") return;
    const pending = nativeRequests.get(message.id);
    if (!pending) return;
    nativeRequests.delete(message.id);
    pending.resolve(message);
  });
  nativePort.onDisconnect.addListener(() => {
    const detail = chrome.runtime.lastError?.message ?? "\u8D77\u52D5\u7BA1\u7406\u30D7\u30ED\u30B0\u30E9\u30E0\u3068\u306E\u63A5\u7D9A\u304C\u7D42\u4E86\u3057\u307E\u3057\u305F\u3002";
    for (const pending of nativeRequests.values()) pending.reject(new Error(detail));
    nativeRequests.clear();
    nativePort = void 0;
  });
  return nativePort;
}
async function nativeRequest(command) {
  const id = ++nativeRequestSequence;
  const port = getNativePort();
  return new Promise((resolve, reject) => {
    nativeRequests.set(id, { resolve, reject });
    try {
      port.postMessage({ id, command });
    } catch (error) {
      nativeRequests.delete(id);
      reject(error);
    }
  });
}
async function ensureOffscreen() {
  const contexts = await new Promise((resolve) => chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] }, resolve));
  if (!contexts.length) await chrome.offscreen.createDocument({ url: "offscreen.html", reasons: [chrome.offscreen.Reason.USER_MEDIA], justification: "Capture and process interview audio in AudioWorklet" });
}
async function localServerHealth() {
  let response;
  response = await fetch("http://127.0.0.1:8765/health");
  if (!response.ok) throw new Error("\u30ED\u30FC\u30AB\u30EB\u8A8D\u8B58\u30B5\u30FC\u30D0\u30FC\u306E\u72B6\u614B\u78BA\u8A8D\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002");
  const health = await response.json();
  if (!health.model_available) throw new Error("\u65E5\u672C\u8A9E\u8A8D\u8B58\u30E2\u30C7\u30EB\u304C\u6E96\u5099\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002");
}
async function ensureLocalServer() {
  try {
    await localServerHealth();
    return;
  } catch {
  }
  let result;
  try {
    result = await nativeRequest("ensure-server");
  } catch (error) {
    throw new Error(`\u8A8D\u8B58\u30B5\u30FC\u30D0\u30FC\u3092\u81EA\u52D5\u8D77\u52D5\u3067\u304D\u307E\u305B\u3093\u3002\u521D\u56DE\u306F\u914D\u5E03\u30D5\u30A9\u30EB\u30C0\u306E Install-InterviewAI.exe \u3092\u5B9F\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u8A73\u7D30: ${String(error)}`);
  }
  if (!result.ok) throw new Error(result.error ?? "\u8A8D\u8B58\u30B5\u30FC\u30D0\u30FC\u3092\u81EA\u52D5\u8D77\u52D5\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002");
  await localServerHealth();
}
async function startFromAction(tab) {
  if (!tab.id) throw new Error("Google Meet \u306E\u30BF\u30D6\u3092\u9078\u3093\u3067\u304B\u3089\u62E1\u5F35\u6A5F\u80FD\u30A2\u30A4\u30B3\u30F3\u3092\u30AF\u30EA\u30C3\u30AF\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
  const streamIdPromise = new Promise((resolve, reject) => chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, (id) => {
    const error = chrome.runtime.lastError;
    if (error) reject(new Error(error.message));
    else resolve(id);
  }));
  const serverPromise = ensureLocalServer();
  const streamId = await streamIdPromise;
  await serverPromise;
  await chrome.storage.session.set({ transcriptEntries: [] });
  chrome.runtime.sendMessage({ type: "transcript-reset" }).catch(() => void 0);
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
  if (message.type === "stop") {
    chrome.runtime.sendMessage({ type: "offscreen-stop" }).then(() => nativeRequest("stop-server").catch(() => void 0)).then(() => sendResponse({ ok: true }));
  }
  return message.type === "stop";
});
