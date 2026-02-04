# Implementation Plan: 002-realtime-forwarding

## Tech & Constraints
- WSゲートウェイは `ws` を使用（Node.js + TypeScript）
- Twilio Media Streamsは PCMU (μ-law 8kHz)
- OpenAI Realtimeは WebSocket接続（音声入力/音声出力イベント）
- PIIとAPIキーはログに出さない

## Data Model (if any)
- セッション単位で `streamSid` と `realtimeSessionId` を紐付ける
- メモリは揮発性（MVP）

## APIs / Interfaces
### Twilio → WSゲートウェイ
- `connected/start/media/stop` イベント
- media payload: base64(PCMU)

### WSゲートウェイ → OpenAI Realtime
- Session start: Realtime WebSocket connect
- Audio input: base64(PCMU) を対応イベントに送信
- Audio output: Realtimeからの音声イベントを受信

### WSゲートウェイ → Twilio
- Realtimeの音声出力を Twilio `media` (outbound) として返送

## Execution Flow
- Phase 1: Realtime接続の確立（認証/初期イベント送信）
- Phase 2: Twilio media → Realtime input の転送
- Phase 3: Realtime output → Twilio outbound の転送
- Phase 4: 切断/再接続とクリーンアップ

## Risks & Mitigations
- 音声フォーマット不一致 → PCMU固定、変換はMVPではしない
- レイテンシ増大 → 低頻度ログ、バッファ最小化
- 再接続ループ → リトライ上限とバックオフを設定
