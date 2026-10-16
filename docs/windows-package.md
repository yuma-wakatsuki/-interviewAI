# Windows配布パッケージ

`scripts/build_windows.ps1` は、モデルをダウンロード済みの開発PC上で次を作成する。

- `release/InterviewAI-Local/InterviewAI-Local.exe` — ローカル認識サーバー
- `release/InterviewAI-Chrome-Extension/` — Chromeで読み込む拡張機能
- `release/licenses.md` — 利用コンポーネントのライセンス記録
- `release/Start-InterviewAI.cmd` — 利用者がダブルクリックする起動ファイル
- `InterviewAI-Windows.zip` — 上記をまとめた社内配布用ZIP

実行方法：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build_windows.ps1
```

作成処理では、生成した `InterviewAI-Local.exe` をポート `18765` で一度起動し、`/health` の応答と拡張機能のManifest V3設定を自動確認する。確認に通った場合だけZIPを作成する。

`InterviewAI-Windows.zip` は、日本語認識モデル・Python実行環境・必要なライブラリを含む自己完結型の配布物である。利用者はPython、Node.js、モデルのインストールを行わない。

配布先ではZIPを展開し、`Start-InterviewAI.cmd` をダブルクリックしてサーバーを起動する。初回のみChromeの `chrome://extensions` でデベロッパーモードを有効にし、`InterviewAI-Chrome-Extension` を「パッケージ化されていない拡張機能を読み込む」から登録する。これはChromeの拡張機能配布仕様による操作である。

モデルを含むため配布ZIPは大きくなる。Windows実機で生成物の起動、マイク許可、Google Meetでの認識を確認してから社内配布に使う。
