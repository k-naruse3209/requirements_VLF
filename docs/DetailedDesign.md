# Detailed Design（詳細設計書）
Version: 0.1 (MVP)
SSOT: docs/DetailedDesign.md

## 参照
- docs/PRD.md
- docs/ConversationSpec.md

## システム概要
音声販売AIが通話中に状態機械で会話を進行し、必要に応じて在庫/価格/配送日/注文保存のツールを呼び出す。運用管理は管理画面（linguaflow-admin）と /api/v1 の管理APIで行う。

## コンポーネント構成
### 音声販売AI（オーケストレータ）
- 状態機械: ConversationSpec の状態遷移を実装
- 入力: 通話音声（STT）とユーザー意図
- 出力: TTS での応答、ツール呼び出し、ログ記録

### テレフォニー
- Twilio Media Streams（μ-law 8kHz / G.711 PCMU）
- 音声ストリームをWSゲートウェイに中継

### WSゲートウェイ
- Node.js（TypeScript）
- OpenAI Realtime APIと双方向ストリーム接続
- Twilioへ返す直前の音声フォーマットを `audio/x-mulaw (PCMU) / 8000Hz` に保証
- Realtime出力がPCM16の場合はゲートウェイ内でPCMU/8kへ変換して送出

### ツール連携
- getStock: 在庫確認
- getPrice: 価格取得
- getDeliveryDate: 配送日取得
- saveOrder: 注文保存（`address` 必須、未確定時は保存処理へ進まない）

### 管理API（/api/v1）
- 認証: login/logout/refresh
- データ管理: contacts/call_schedules/call_logs/messages

### 管理画面（linguaflow-admin）
- 認証付きUI
- 進行中通話の監視
- 通話ログと会話内容の閲覧
- 連絡先と通話予定のCRUD

## データモデル（MVP）
### Contact
- id
- name
- phone_number
- address
- description
- created_at, updated_at

### CallLog
- id
- phone_number（Contact.phone_number と関連）
- status: up, down
- call_type: inbound, outbound
- created_at, updated_at
- 関連: Contact（任意）, Message（1対多）

### Message
- id
- call_log_id
- role: user, assistant
- content
- translation
- created_at, updated_at

### CallSchedule
- id
- contact_id
- status: failed, pending, processing, completed, canceled, no_answer
- start_at
- created_at, updated_at

### Order（保存対象）
- productId
- price
- deliveryDate
- address
- customerPhone
- timestamp

### データモデル対応（API ⇔ SQLite）
- Contact -> contacts
- CallLog -> calls
- CallLog.phone_number -> calls.from_number / calls.to_number
- Message -> utterances
- CallSchedule -> call_schedules

## SQLiteスキーマ（MVP）
永続化はSQLiteを使用する。IDはULID（TEXT）、時刻はUTCのISO-8601文字列。
詳細なDDLは `docs/DBSchema.sql` を参照。

## 認証設計（管理画面）
### ログイン
- POST /api/v1/login
- 入力: email, password
- 出力: token（JWT / Bearer）
- refresh_token はHTTP Cookieで発行（MVP default: 30日）

### トークン更新
- POST /api/v1/refresh
- refresh_token を用いて token を再発行
- フロントは401時にrefreshを試行して再リクエスト

### ログアウト
- POST /api/v1/logout
- refresh_token を破棄しセッション終了

### トークン方針（MVP default）
- Access token: 15分
- Refresh token: 30日
- refresh_token はDBにハッシュ保存

## 管理API設計（MVP）
### Contacts
- GET /api/v1/contacts（filters: phone_number, auth: required）
- POST /api/v1/contacts（auth: required）
- PUT /api/v1/contacts/:id（auth: required）
- DELETE /api/v1/contacts/:id（auth: required）

### Call Schedules
- GET /api/v1/call_schedules（filters: phone_number, status, date_range, auth: required）
- POST /api/v1/call_schedules（auth: required）
- PUT /api/v1/call_schedules/:id（auth: required）
- DELETE /api/v1/call_schedules/:id（auth: required）

### Call Logs
- GET /api/v1/call_logs（filters: status, auth: required）
- POST /api/v1/call_logs（auth: not required）
- PUT /api/v1/call_logs/:id（auth: not required）
- DELETE /api/v1/call_logs/:id（auth: required）

### Messages
- GET /api/v1/call_logs/:id/messages（auth: required）
- POST /api/v1/call_logs/:id/messages（auth: not required）

## 画面設計（管理画面）
### Home
- 目的: 進行中通話の監視
- データ: call_logs（status=up）
- 更新: ポーリングで最新化
- 操作: 会話詳細を開く

### Call Logs
- 一覧: 全通話ログ
- フィルタ: status（API） + テーブル内検索
- 並び順: created_at 降順
- 会話詳細: messages を created_at 昇順で表示

### 管理画面向けクエリ設計（SQLite）
- Call Logs 一覧: calls を started_at DESC でページング
- Call Logs フィルタ: status, customer_id, date range（started_at）
- Call Logs 詳細: calls + utterances + transcripts + notes + tags を call_id で取得
- Contacts/Customers: customer_id 単位で calls 集計（件数/直近通話）
- Notes: author_id / category / score で絞り込み

### Contacts
- 一覧: contacts
- 操作: 作成/編集/削除
- 入力バリデーション: phone_number は数字のみ

### Call Schedules
- 一覧: call_schedules
- フィルタ: phone_number, status, date_range（API）
- 操作: 作成/編集/削除
- 作成: contact_ids, status, start_at
- 更新: status, start_at

## 音声販売AIの状態遷移
ConversationSpec の状態一覧と遷移表に準拠する。

## 配送先情報の解決
- ST_DeliveryCheck で配送日ツールを呼ぶ前に address を解決する
- address の取得順序:
  1. CallLog.phone_number に紐づく Contact.address を参照
  2. Contact.address が空の場合は通話中に住所を聞き取り、確認後に使用
- ST_OrderConfirmation で saveOrder 実行前に `addressConfirmed=true` を必須検証する

## バージイン（割り込み）制御
- トリガーは `input_audio_buffer.speech_started`
- 停止処理は Twilio `clear` + `response.cancel` + ローカル送信キュー破棄で一本化
- 二重キャンセルを避けるため、`response.cancel` は冪等ガード付きで送信する
- CallSid単位で `speech_started` / `response.cancelled` / `response.done` / `twilio clear` を記録する

## エラーハンドリング
### 音声販売AI
- EX_Silence / EX_NoHear は ConversationSpec に従う
- Correctionは専用状態に遷移せず、内部例外処理でコンテキストをリセットして `ST_RequirementCheck` に戻す
- ツールタイムアウトは各ツールの制約に従い、失敗時は ST_Closing に遷移

### 管理API/画面
- 401時は refresh を試行し、失敗時はログインに戻る
- APIエラーはUI通知（トースト）で表示

## 監視・ログ
- ツールエラーはエラーログに記録する（ConversationSpec 準拠）
- 管理APIはリクエスト/レスポンスのログを出力する

## 永続化フロー（SQLite）
### 保存タイミング
- 通話開始（CallLog生成）: calls.started_at を登録
- 会話中の発話: utterances に逐次保存
- 文字起こし: transcripts に通話単位で保存（必要ならセグメント単位）
- 通話終了: calls.ended_at / duration_sec / status を更新
- 評価メモ: notes に作成（担当者/スコア/カテゴリ）
- タグ付け: call_tags で多対多

### 責務分離
- WSゲートウェイ: 音声中継のみ（DB書き込みなし）
- オーケストレータ/API: DB書き込みの唯一の責務
- 管理画面: 読み取り中心（作成はnotes/tagsのみ）

## 起動エントリ（SSOT）
- `api`: `src/server.js`
- `voip-client`: `src/server.ts`
- `proxy`: `src/index.js`
- `ws-gateway`: `src/index.ts`

### SQLiteリポジトリ層（実装方針）
- 単一DBファイル（例: data/app.db）を起点に接続を共有
- 書き込みはリポジトリ経由で実行し、APIはリポジトリのみを利用
- 例外はAPI層で握り、ログに必要情報（call_id, endpoint）を残す

### リポジトリI/O（最小）
- CallsRepo: create/start, finish/update, list, findById
- UtterancesRepo: create, listByCallId
- TranscriptsRepo: create, listByCallId
- NotesRepo: create, listByCallId, listByFilters
- TagsRepo: upsert, attachToCall, listByCallId
- ContactsRepo: create/update, list, findByPhone
- CallSchedulesRepo: create/update, listByFilters

## 非機能要件（MVP）
- 認証必須の管理画面
- 通話ログと会話メッセージの永続化
- 管理画面は最新通話を一定間隔で更新
- Twilio送信音声は常にPCMU（μ-law 8kHz）を満たす
- Realtime接続は `REALTIME_AUDIO_MODE` によりPCMU/PCM16を選択できるが、Twilio向け出力保証を優先する
