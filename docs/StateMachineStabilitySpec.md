# State Machine Stability Spec (ws-gateway)

## 目的
- 通話開始時の先走り発話を防止する。
- brand/weight 収集後に会話が停止せず、明確に次状態へ進む。
- AI 音声を状態機械の発話文に最大限一致させる。
- 実通話の AI/USER 発話をログから再現可能にする。

## 対象実装
- `ws-gateway/src/conversation.ts`
- `ws-gateway/src/index.ts`
- `ws-gateway/src/config.ts`
- `ws-gateway/scripts/rice_flow_test.ts`
- `ws-gateway/scripts/extract_last_call_conv.sh`
- `ws-gateway/package.json`
- `docs/realtime_dialect.md`

## 状態機械仕様
### 初期状態
- 新規通話は必ず `ST_Greeting` から開始する。
- 根拠:
  - `ws-gateway/src/conversation.ts:873`

### 要件収集と確認
- brand/weight 抽出は `ST_Greeting` / `ST_RequirementCheck` / `ST_RequirementConfirm` のみで有効。
- 非要件状態で brand/weight を上書きしない。
- brand と weight が両方揃ったら `ST_RequirementConfirm` に遷移し、`はい/いいえ` で確定する。
- `いいえ` の場合は brand/weight をクリアして `ST_RequirementCheck` に戻る。
- 根拠:
  - `ws-gateway/src/conversation.ts:586`
  - `ws-gateway/src/conversation.ts:680`
  - `ws-gateway/src/conversation.ts:711`
  - `ws-gateway/src/conversation.ts:728`

### 不足スロット再質問
- 片方のみ取得時は不足スロットだけ再質問する。
- 根拠:
  - `ws-gateway/src/conversation.ts:372`
  - `ws-gateway/src/conversation.ts:587`
  - `ws-gateway/src/conversation.ts:710`

### Closing 条件
- `closingReason` の初期値は `error`。
- `success/cancel` は明示条件でのみ設定し、`ST_Closing` へ遷移する。
- 根拠:
  - `ws-gateway/src/conversation.ts:320`
  - `ws-gateway/src/conversation.ts:512`
  - `ws-gateway/src/conversation.ts:817`
  - `ws-gateway/src/conversation.ts:858`

## Realtime/Turn ガード仕様
### session.update 完了前ガード
- `session.updated` 受信前は会話開始しない。
- `session.updated` 受信前は Twilio inbound media を Realtime に流さない。
- `createResponse` も `session.updated` 前送信を禁止し、defer する。
- 根拠:
  - `ws-gateway/src/index.ts:282`
  - `ws-gateway/src/index.ts:629`
  - `ws-gateway/src/index.ts:743`
  - `ws-gateway/src/index.ts:941`
  - `ws-gateway/src/index.ts:448`

### commit/transcript ガード
- `speech_started` がない committed は破棄する。
- assistant 発話中の transcript は即捨てせず defer する。
- 根拠:
  - `ws-gateway/src/index.ts:512`
  - `ws-gateway/src/index.ts:507`

### 連続 AI 発話抑止
- `response.done` で queuedPrompt を自動 flush しない。
- 次の user turn で queuedPrompt を破棄する。
- 根拠:
  - `ws-gateway/src/index.ts:565`

## AI 発話一致仕様
### verbatim wrapper
- `response.create.instructions` は `<read_aloud>...</read_aloud>` で包み、本文のみ一字一句読み上げを要求する。
- 根拠:
  - `ws-gateway/src/index.ts:44`
  - `ws-gateway/src/index.ts:461`

### out-of-band response
- `response.create` は `conversation: "none"` + `input: []` で発行し、過去会話文脈の混入を抑制する。
- 根拠:
  - `ws-gateway/src/index.ts:466`
  - `ws-gateway/src/index.ts:483`

### mismatch 検知
- 期待発話と実際の `response.audio_transcript.done` を比較し、不一致時は `assistant.transcript.mismatch` を出力する。
- 根拠:
  - `ws-gateway/src/index.ts:420`

## カタログ仕様
- `PRODUCT_CATALOG_PATH` 未設定/空/読み込み失敗時は、メモリ上のフォールバック銘柄カタログを使用する。
- これにより `ST_ProductSuggestion` で即座に「ご案内できるお米がありません」へ落ちるのを防止する。
- 根拠:
  - `ws-gateway/src/index.ts:198`
  - `ws-gateway/src/index.ts:206`
  - `ws-gateway/src/index.ts:220`

## ログ仕様
### 会話ログ
- AI 発話:
  - `[CONV] AI {"text":"...","source":"..."}`
- USER 発話:
  - `[CONV] USER {"text":"...","confidence":...}`
- 根拠:
  - `ws-gateway/src/index.ts:429`
  - `ws-gateway/src/index.ts:530`

### 起動時 runtime snapshot
- 起動ログに runtime knobs を出力する。
- 根拠:
  - `ws-gateway/src/index.ts:1040`

## 抽出コマンド仕様
- `npm run conv:last`: 直近通話の `[CONV]` を抽出
- `npm run conv:all`: ログ全体の `[CONV]` を抽出
- 根拠:
  - `ws-gateway/package.json:10`
  - `ws-gateway/package.json:11`

## 回帰テスト仕様
- `rice_flow_test.ts` は要件確認ステートを含むケースまで検証する。
- split-slot brand->weight / weight->brand / non-requirement overwrite 防止 / requirement confirm no をカバー。
- 根拠:
  - `ws-gateway/scripts/rice_flow_test.ts:149`
  - `ws-gateway/scripts/rice_flow_test.ts:167`
  - `ws-gateway/scripts/rice_flow_test.ts:185`
  - `ws-gateway/scripts/rice_flow_test.ts:216`

## 運用チェックリスト
1. `ws-gateway` 再起動後の最新ログで検証する。
2. `realtime send response.create` に `conversation:"none"` / `input:[]` / `<read_aloud>` が入っていることを確認する。
3. `assistant.transcript.mismatch` が継続する場合は、その call の `[CONV] AI/USER` と `state.enter` をセットで確認する。
4. 必須検証:
   - `npm run build`
   - `npm run rice-test`

## 現時点の残課題
- ASR が多言語ノイズを返した場合、要件確認ステートでの再質問回数が増える可能性がある。
- AI 音声生成は改善済みだが、モデル側仕様変更時に再び drift が出る可能性があるため、`assistant.transcript.mismatch` は監視継続対象とする。
