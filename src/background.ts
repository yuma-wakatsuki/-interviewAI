// Capturing a tab requires a direct extension-action gesture.  Opening a side
// panel first and asking it to capture later loses that grant in Chrome.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(console.error);

const NATIVE_HOST_NAME = 'com.interviewai.transcriber';
let nativePort: chrome.runtime.Port | undefined;
let nativeRequestSequence = 0;
const nativeRequests = new Map<number, { resolve: (value: { ok?: boolean; error?: string }) => void; reject: (reason: Error) => void }>();

function getNativePort() {
  if (nativePort) return nativePort;
  nativePort = chrome.runtime.connectNative(NATIVE_HOST_NAME);
  nativePort.onMessage.addListener((message: { id?: number; ok?: boolean; error?: string }) => {
    if (typeof message.id !== 'number') return;
    const pending = nativeRequests.get(message.id);
    if (!pending) return;
    nativeRequests.delete(message.id);
    pending.resolve(message);
  });
  nativePort.onDisconnect.addListener(() => {
    const detail = chrome.runtime.lastError?.message ?? '起動管理プログラムとの接続が終了しました。';
    for (const pending of nativeRequests.values()) pending.reject(new Error(detail));
    nativeRequests.clear();
    nativePort = undefined;
  });
  return nativePort;
}

async function nativeRequest(command: 'ensure-server' | 'stop-server') {
  const id = ++nativeRequestSequence;
  const port = getNativePort();
  return new Promise<{ ok?: boolean; error?: string }>((resolve, reject) => {
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
  const contexts = await new Promise<chrome.runtime.ExtensionContext[]>(resolve =>
    chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType] }, resolve));
  if (!contexts.length) await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: [chrome.offscreen.Reason.USER_MEDIA], justification: 'Capture and process interview audio in AudioWorklet' });
}

async function localServerHealth() {
  let response: Response;
  response = await fetch('http://127.0.0.1:8765/health');
  if (!response.ok) throw new Error('ローカル認識サーバーの状態確認に失敗しました。');
  const health = await response.json() as { model_available?: boolean };
  if (!health.model_available) throw new Error('日本語認識モデルが準備されていません。');
}

async function ensureLocalServer() {
  try {
    await localServerHealth();
    return;
  } catch {
    // The package's Native Messaging host starts the bundled server without a
    // PowerShell window. It is only needed when no local server is running.
  }
  let result: { ok?: boolean; error?: string };
  try {
    result = await nativeRequest('ensure-server');
  } catch (error) {
    throw new Error(`認識サーバーを自動起動できません。初回は配布フォルダの Install-InterviewAI.exe を実行してください。詳細: ${String(error)}`);
  }
  if (!result.ok) throw new Error(result.error ?? '認識サーバーを自動起動できませんでした。');
  await localServerHealth();
}

async function startFromAction(tab: chrome.tabs.Tab) {
  if (!tab.id) throw new Error('Google Meet のタブを選んでから拡張機能アイコンをクリックしてください。');
  // tabCapture must be requested while Chrome still considers this toolbar
  // click a direct user gesture. Server startup can take several seconds, so
  // begin both operations before awaiting either one.
  const streamIdPromise = new Promise<string>((resolve, reject) =>
    chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id! }, id => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message)); else resolve(id);
    }));
  const serverPromise = ensureLocalServer();
  const streamId = await streamIdPromise;
  await serverPromise;
  // A toolbar click begins a new interview capture. Final rows are stored in
  // session storage so closing the side panel does not lose them, but must not
  // leak into the next interview.
  await chrome.storage.session.set({ transcriptEntries: [] });
  chrome.runtime.sendMessage({ type: 'transcript-reset' }).catch(() => undefined);
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
  if (message.type === 'stop') {
    chrome.runtime.sendMessage({ type: 'offscreen-stop' })
      .then(() => nativeRequest('stop-server').catch(() => undefined))
      .then(() => sendResponse({ ok: true }));
  }
  return message.type === 'stop';
});
