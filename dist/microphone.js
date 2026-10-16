// src/microphone.ts
var button = document.querySelector("#grant");
var status = document.querySelector("#status");
button.onclick = async () => {
  button.disabled = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    stream.getTracks().forEach((track) => track.stop());
    const result = await chrome.runtime.sendMessage({ type: "offscreen-start-mic" });
    if (!result?.ok) throw new Error(result?.error ?? "\u30DE\u30A4\u30AF\u53D6\u5F97\u3092\u958B\u59CB\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002");
    status.textContent = "\u30DE\u30A4\u30AF\u3092\u8A31\u53EF\u3057\u307E\u3057\u305F\u3002\u3053\u306E\u30BF\u30D6\u306F\u9589\u3058\u3066\u69CB\u3044\u307E\u305B\u3093\u3002";
  } catch (error) {
    status.textContent = `\u30DE\u30A4\u30AF\u306E\u8A31\u53EF\u306B\u5931\u6557\u3057\u307E\u3057\u305F: ${String(error)}`;
    button.disabled = false;
  }
};
