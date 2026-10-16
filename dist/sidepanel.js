// src/sidepanel.ts
var statusEl = document.querySelector("#status");
var transcript = document.querySelector("#transcript");
var start = document.querySelector("#start");
var grantMic = document.querySelector("#grant-mic");
var stopButton = document.querySelector("#stop");
var entries = [];
var partials = /* @__PURE__ */ new Map();
var diagnostics = [];
async function refreshServerStatus() {
  try {
    const response = await fetch("http://127.0.0.1:8765/health");
    const health = await response.json();
    if (health.status === "ok" && health.model_available) {
      statusEl.textContent = "\u30ED\u30FC\u30AB\u30EB\u8A8D\u8B58\u30B5\u30FC\u30D0\u30FC\u306E\u6E96\u5099\u304C\u3067\u304D\u307E\u3057\u305F\u3002Meet \u30BF\u30D6\u3067\u62E1\u5F35\u6A5F\u80FD\u30A2\u30A4\u30B3\u30F3\u3092\u30AF\u30EA\u30C3\u30AF\u3057\u3066\u304F\u3060\u3055\u3044\u3002";
    } else {
      statusEl.textContent = "\u65E5\u672C\u8A9E\u8A8D\u8B58\u30E2\u30C7\u30EB\u306E\u6E96\u5099\u304C\u3067\u304D\u3066\u3044\u307E\u305B\u3093\u3002scripts\\start_windows.ps1 \u3092\u5B9F\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002";
    }
  } catch {
    statusEl.textContent = "\u30ED\u30FC\u30AB\u30EB\u8A8D\u8B58\u30B5\u30FC\u30D0\u30FC\u304C\u8D77\u52D5\u3057\u3066\u3044\u307E\u305B\u3093\u3002scripts\\start_windows.ps1 \u3092\u5B9F\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002";
  }
}
void refreshServerStatus();
function render() {
  const finalRows = entries.filter((e) => e.type === "final");
  transcript.textContent = [...partials.values(), ...finalRows].map((e) => e.type === "partial" ? `${e.speaker}: ${e.text} \u2026` : `[${e.timestamp ?? ""}] ${e.speaker}: ${e.text}`).join("\n");
}
chrome.runtime.onMessage.addListener((event) => {
  if (!event.type) return;
  if (event.type === "partial" && event.speaker) partials.set(event.speaker, event);
  else {
    if (event.type === "final" && event.speaker) partials.delete(event.speaker);
    entries.push(event);
  }
  if (event.type === "diagnostic" && event.detail) {
    diagnostics.push(event.detail);
    if (diagnostics.length > 20) diagnostics.shift();
  }
  render();
  if (event.type === "diagnostic" && event.detail?.includes("WebSocket connected")) statusEl.textContent = "\u30ED\u30FC\u30AB\u30EB\u8A8D\u8B58\u30B5\u30FC\u30D0\u30FC\u3078\u63A5\u7D9A\u3057\u307E\u3057\u305F\u3002";
  if (event.type === "diagnostic" && event.detail?.includes("Meet audio capture started")) statusEl.textContent = "Meet \u97F3\u58F0\u3092\u9332\u97F3\u4E2D\u3067\u3059\u3002\u6B21\u306B\u300C\u30DE\u30A4\u30AF\u3092\u8A31\u53EF\u300D\u3092\u62BC\u3057\u3066\u304F\u3060\u3055\u3044\u3002";
  if (event.type === "diagnostic" && event.detail?.includes("Interviewer microphone capture started")) statusEl.textContent = "Meet \u97F3\u58F0\u3068\u30DE\u30A4\u30AF\u3092\u9332\u97F3\u4E2D\u3067\u3059\u3002";
  if (event.type === "diagnostic" && event.detail?.includes("Capture stopped")) statusEl.textContent = "\u505C\u6B62\u3057\u307E\u3057\u305F\u3002";
});
start.onclick = async () => {
  statusEl.textContent = "Google Meet \u306E\u30BF\u30D6\u3092\u9078\u3073\u3001Chrome\u53F3\u4E0A\u306E\u62E1\u5F35\u6A5F\u80FD\u30A2\u30A4\u30B3\u30F3\u3092\u30AF\u30EA\u30C3\u30AF\u3057\u3066\u958B\u59CB\u3057\u3066\u304F\u3060\u3055\u3044\u3002";
};
grantMic.onclick = async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL("microphone.html") });
  statusEl.textContent = "\u958B\u3044\u305F\u300CInterviewAI \u306E\u30DE\u30A4\u30AF\u8A31\u53EF\u300D\u30BF\u30D6\u3067\u3001\u30DE\u30A4\u30AF\u3092\u8A31\u53EF\u3057\u3066\u304F\u3060\u3055\u3044\u3002";
};
stopButton.onclick = async () => {
  await chrome.runtime.sendMessage({ type: "offscreen-stop" });
  statusEl.textContent = "\u505C\u6B62\u3057\u307E\u3057\u305F";
};
document.querySelector("#export").addEventListener("click", () => {
  const rows = entries.filter((e) => e.type === "final");
  const content = [`InterviewAI transcript`, `Exported: ${(/* @__PURE__ */ new Date()).toLocaleString("ja-JP")}`, "", ...rows.map((e) => `[${e.timestamp}] ${e.speaker}: ${e.text}`)].join("\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `interview-${(/* @__PURE__ */ new Date()).toISOString()}.txt` });
  a.click();
  URL.revokeObjectURL(url);
});
