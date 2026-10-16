# 性能検証記録

## 2026-10-16: 10分連続プロトコル試験

ローカルの ReazonSpeech Zipformer モデルと FastAPI サーバーを使い、`server.duration_test` でモデル付属の日本語音声を100 ms PCMパケットとして実時間送信した。10秒の発話ごとに0.8秒の無音を加え、暫定結果と確定結果を繰り返し発生させた。

| 項目 | 実測値 |
| --- | ---: |
| 連続時間 | 601.1 秒 |
| WebSocket 切断 | 0 件 |
| 暫定結果 | 493 件 |
| 確定結果 | 94 件 |
| 平均認識処理時間 | 123.6 ms |
| 最大 RSS | 544,165,888 bytes（約519 MiB） |
| 平均 CPU 使用率 | 18.3% |

この試験は、音声キュー、WebSocket接続、暫定／確定の状態遷移、およびローカル推論の連続性を検証したものです。Google Meetの実音声、二話者同時入力、10分を超える時間、精度評価は別途測定が必要です。

実行方法：

```bash
python -m server.duration_test --seconds 600
python -m server.report_metrics
```
