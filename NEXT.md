# Handoff Packet (2026-02-10)

## 1) 目的 / DoD
- 米営業の状態機械を、仕様と実装で一貫させる。
- 通話中に「勝手に進む / 勝手に締める / 途中で切れる」を抑止する。
- 再現可能なログ（Twilio/Realtime/State）で、遷移停止点と分岐理由を追跡できる。
- `ws-gateway` の検証コマンドが通る状態を維持する（`npm run verify`）。

## 2) 現在の状態（できていること / 未解決）

### できていること
- ブランチは `codex/spec-ex-correction-consistency`、HEAD は `0813735`。
- `ws-gateway` で以下の検証系コマンドが実装済み。
  - `npm run test`（`rice-test` + `audio-test`）
  - `npm run typecheck`
  - `npm run verify`
- 状態遷移ログと分岐ログを追加済み。
  - `[STATE] <prev> -> <next> reason=... ctx=...`
  - `[BRANCH] ...`
  - `[TWILIO] event=...`
  - `[REALTIME] event=...`
- Realtime/Twilio のバージイン処理・Twilio clear の冪等化は導入済み。
- 音声フォーマットは Twilio 送信直前で `audio/x-mulaw@8000` を維持する実装あり。

### 未解決 / 継続監視
- 実通話では STT が空文字になるターンがあり、会話ログと体感会話がズレるケースがある。
- `LOG_API_BASE_URL=http://127.0.0.1:3100` が落ちていると `callLogId` が取れず、保存系はスキップされる。
- 会話品質は `REALTIME_INTERRUPT_RESPONSE` や VAD 設定に依存し、環境差で体感がぶれる。

## 3) 決定事項（SSOT）
- Correction は状態 `EX_Correction` を持たず、内部例外処理として `ST_RequirementCheck` へ戻す。
- `saveOrder` は `address` 必須。住所未確定では保存処理に進めない。
- バージインは `input_audio_buffer.speech_started` を主トリガに統一し、二重キャンセルはガードする。
- Twilio 送信音声は常に `mulaw/8k`。
- 起動 SSOT は README 記載の各サービスエントリを採用。

## 4) 次の作業 TODO（優先度順）

### P0
- 実通話での STT 空文字ターンを再現し、入力レベル・VAD・commit タイミングのどれが支配要因か切り分ける。
- `conversation.log` と `ws-gateway.raw.log` の同一 CallSid で、1ターンごとの差異（検知/未検知）を定量化する。

### P1
- 在庫/価格/住所/配送日の各状態で「状態固有分岐以外の誤抽出」を抑止する追加テストを増やす。
- API サーバ未起動時の保存スキップを、運用で気づける警告メッセージに統一する。

### P2
- `docs/ConsistencyAudit_Prompt7.md` の残課題（A-1/A-2/C-1/D-2 など）を順にチケット化して実施。

## 5) 変更ファイル一覧（重要差分）

`d2b469d..0813735` の主な差分:
- `README.md`
  - 起動順、ポート、env 例、検証手順、SSOT を明文化。
- `docs/ConversationSpec.md`
  - Correction の扱いを内部例外処理として整理。
- `docs/DetailedDesign.md`
- `docs/ImplementationPlan.md`
- `docs/ImplementationTickets.md`
- `docs/ConsistencyAudit_Prompt7.md`
  - 仕様/実装/テスト監査結果と優先度付き課題を記録。
- `ws-gateway/src/index.ts`
  - Twilio/Realtime イベントログ整理、会話生成経路修正、音声/バージイン制御強化。
- `ws-gateway/src/conversation.ts`
  - 状態遷移ログ追加、要件抽出の適用状態を限定、分岐ログ追加。
- `ws-gateway/src/tools.ts`
  - 在庫/注文まわりの入力整合性を強化。
- `ws-gateway/src/audio.ts`
  - 音声フォーマット変換と保証の補助実装。
- `ws-gateway/scripts/rice_flow_test.ts`
  - 追加ケースで遷移暴走回帰を検知。
- `ws-gateway/scripts/audio_format_test.ts`
  - 音声フォーマット検証。
- `ws-gateway/scripts/dev_conversation_log.mjs`
  - 会話抽出ログを取りやすくする開発用スクリプト。
- `ws-gateway/inventory.json`
  - 在庫データ（ローカルフォールバック）。
- `ws-gateway/package.json`
  - `test` / `typecheck` / `verify` / `dev:conversation-log` を整備。
- `api/README.md`, `api/package.json`, `voip-client/README.md`, `ws-gateway/.gitignore`
  - 起動/運用整備。

## 6) ローカル再現 / テスト手順

### 前提
- 作業リポジトリ: `/Users/narusekeisuke/projects/requirements_VLF_codex_realtime_verbatim`
- ブランチ: `codex/spec-ex-correction-consistency`

### 検証（ws-gateway）
```bash
cd /Users/narusekeisuke/projects/requirements_VLF_codex_realtime_verbatim/ws-gateway
npm install
npm run verify
```

### 会話ログ付き起動（単一プロセス）
- `dev` と `dev:conversation-log` を同時起動しない（同じ `WS_PORT=8080` を使うため）。
```bash
cd /Users/narusekeisuke/projects/requirements_VLF_codex_realtime_verbatim/ws-gateway
: > logs/conversation.log
OPENAI_API_KEY=<your_key> \
LOG_API_BASE_URL=http://127.0.0.1:3100 \
REALTIME_MODEL=gpt-realtime \
REALTIME_SCHEMA=flat \
REALTIME_AUDIO_MODE=pcmu \
REALTIME_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe \
REALTIME_VERBATIM=0 \
REALTIME_INTERRUPT_RESPONSE=0 \
WS_PORT=8080 \
npm run dev:conversation-log
```

### ログ確認
```bash
tail -f /Users/narusekeisuke/projects/requirements_VLF_codex_realtime_verbatim/ws-gateway/logs/conversation.log
tail -f /Users/narusekeisuke/projects/requirements_VLF_codex_realtime_verbatim/ws-gateway/logs/ws-gateway.raw.log
```

## 7) 既知の落とし穴（詰まりポイント）
- `EADDRINUSE:8080`:
  - `npm run dev` と `npm run dev:conversation-log` を同時に実行すると競合する。
- `LOG_API_BASE_URL` 到達不可 (`ECONNREFUSED 127.0.0.1:3100`):
  - `callLogId` が取れず、保存・更新系が `skip` になる。
- Realtime 送信 payload の `conversation.item.create` content type:
  - `input_text` ではなく `text` を使う（ここが崩れると `invalid_value` が出る）。
- 長い音声が途中で切れる問題:
  - `REALTIME_INTERRUPT_RESPONSE=1` だと割り込みで止まりやすい。通話品質検証時は `0` で比較する。
- STT 空文字ターン:
  - `input_audio_buffer.committed` は出るが転写が空のケースがある。`committed without transcript` の回数を監視する。

## 8) 次スレッド開始時チェックリスト
- `git branch --show-current` が `codex/spec-ex-correction-consistency` であること。
- `git status --short` がクリーンであること。
- `npm run verify` が通ること。
- 会話ログで `AI:` と `USER:` が想定通りに追えること（少なくとも 1 往復）。
