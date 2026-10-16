// src/sidepanel.ts
var statusEl = document.querySelector("#status");
var transcript = document.querySelector("#transcript");
var start = document.querySelector("#start");
var grantMic = document.querySelector("#grant-mic");
var stopButton = document.querySelector("#stop");
var entries = [];
function render() {
  transcript.textContent = entries.map((e) => e.type === "diagnostic" ? `[\u8A3A\u65AD] ${e.detail}` : `[${e.timestamp ?? ""}] ${e.speaker}: ${e.text}${e.type === "partial" ? " \u2026" : ""}`).join("\n");
}
chrome.runtime.onMessage.addListener((event) => {
  entries.push(event);
  render();
  if (event.type === "diagnostic" && event.detail?.includes("Meet audio capture started")) statusEl.textContent = "Meet \u97F3\u58F0\u3092\u9332\u97F3\u4E2D\u3067\u3059\u3002\u6B21\u306B\u300C\u30DE\u30A4\u30AF\u3092\u8A31\u53EF\u300D\u3092\u62BC\u3057\u3066\u304F\u3060\u3055\u3044\u3002";
  if (event.type === "diagnostic" && event.detail?.includes("Interviewer microphone capture started")) statusEl.textContent = "Meet \u97F3\u58F0\u3068\u30DE\u30A4\u30AF\u3092\u9332\u97F3\u4E2D\u3067\u3059\u3002";
  if (event.type === "diagnostic" && event.detail?.includes("Capture stopped")) statusEl.textContent = "\u505C\u6B62\u3057\u307E\u3057\u305F\u3002";
});
start.onclick = async () => {
  statusEl.textContent = "Google Meet \u306E\u30BF\u30D6\u3092\u9078\u3073\u3001Chrome\u53F3\u4E0A\u306E\u62E1\u5F35\u6A5F\u80FD\u30A2\u30A4\u30B3\u30F3\u3092\u30AF\u30EA\u30C3\u30AF\u3057\u3066\u958B\u59CB\u3057\u3066\u304F\u3060\u3055\u3044\u3002";
};
grantMic.onclick = async () => {
  try {
    const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    permissionStream.getTracks().forEach((track) => track.stop());
    const result = await chrome.runtime.sendMessage({ type: "offscreen-start-mic" });
    statusEl.textContent = result.ok ? "\u30DE\u30A4\u30AF\u3092\u63A5\u7D9A\u3057\u3066\u3044\u307E\u3059\u3002" : `\u30DE\u30A4\u30AF\u958B\u59CB\u5931\u6557: ${result.error}`;
  } catch (error) {
    statusEl.textContent = `\u30DE\u30A4\u30AF\u8A31\u53EF\u5931\u6557: ${String(error)}`;
  }
};
stopButton.onclick = async () => {
  await chrome.runtime.sendMessage({ type: "offscreen-stop" });
  statusEl.textContent = "\u505C\u6B62\u3057\u307E\u3057\u305F";
};
document.querySelector("#export").addEventListener("click", () => {
  const content = entries.filter((e) => e.type === "final").map((e) => `[${e.timestamp}] ${e.speaker}: ${e.text}`).join("\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `interview-${(/* @__PURE__ */ new Date()).toISOString()}.txt` });
  a.click();
  URL.revokeObjectURL(url);
});
