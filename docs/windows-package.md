# Windows配布パッケージ

`scripts/build_windows.ps1` は、モデルをダウンロード済みの開発PC上で次を作成する。

- `release/InterviewAI-Local/InterviewAI-Local.exe` — ローカル認識サーバー
- `release/InterviewAI-Chrome-Extension/` — Chromeで読み込む拡張機能
- `release/licenses.md` — 利用コンポーネントのライセンス記録

実行方法：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build_windows.ps1
```

配布先では `InterviewAI-Local.exe` を起動してから、`InterviewAI-Chrome-Extension` をChromeに読み込む。モデルを含むため配布フォルダは大きくなる。Windows実機で生成物の起動、マイク許可、Google Meetでの認識を確認してから社内配布に使う。
