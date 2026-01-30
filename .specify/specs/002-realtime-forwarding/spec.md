# Spec: 002-realtime-forwarding

## User Scenarios & Why
- 開発者がTwilio Media Streamsの音声をOpenAI Realtimeへ中継し、リアルタイム応答の疎通を確認したい。
- WSゲートウェイが「音声入力→AI応答→音声出力」の経路を最低限成立させたい。

## Acceptance Scenarios (Given/When/Then)
1. Given WSゲートウェイが起動している, When Twilioのmediaが届く, Then Realtimeセッションへ音声が送信される。
2. Given Realtimeが音声応答を返す, When 応答イベントを受信する, Then Twilioへ音声を返す（outbound track）。
3. Given Realtime接続が切断される, When 再接続が成功する, Then 通話を継続できる。

## Edge Cases
- OpenAI APIキーが未設定の場合は接続を拒否しログに残す。
- Realtimeがエラーを返した場合は通話を終了し、原因を記録する。
- Twilioのmediaが停止したらRealtimeセッションを閉じる。

## Out of Scope
- LLMのプロンプト最適化や会話設計の改善
- 長時間通話の安定化（Phase 2以降）
