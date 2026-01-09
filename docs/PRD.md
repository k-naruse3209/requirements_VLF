# PRD（Product Requirements Document）

**プロダクト名**: VLF（Voice sales AI）- 音声販売AI
**バージョン**: 0.1 (MVP)
**最終更新**: 2025-01-07
**SSOT**: docs/PRD.md

---

## 目的
電話での購買完結を支援する音声販売AIと、運用管理のための管理画面を一体として提供する。

## 対象ユーザー
一次ユーザー: 電話で商品購入/相談を行う顧客  
二次ユーザー: 受電オペレーター/CS  
管理ユーザー: 管理画面で運用を行う社内担当者

## 提供価値
- 顧客: 電話だけで要件確認から注文確定まで完了できる
- 運営: 応対の標準化と問い合わせ削減
- 管理: 通話状況や予定を把握し、連絡先・スケジュールを管理できる

## スコープ（MVP）
- 音声通話フロー（ConversationSpec に準拠）
- 在庫/価格/配送日取得と注文保存（ツール連携）
- テレフォニー: Twilio Media Streams（μ-law 8kHz / G.711 PCMU）
- WSゲートウェイ: Node.js（TypeScript）
- 管理画面（linguaflow-admin）の認証（メール/パスワードログイン、トークン更新、ログアウト）
- 管理画面 Home: 進行中通話一覧（status=up）
- 管理画面 Call Logs: 通話ログ一覧、会話詳細（メッセージと翻訳の切替表示）
- 管理画面 Contacts: 連絡先の作成/編集/削除（name, phone_number, address, description）
- 管理画面 Call Schedules: 通話予定の作成/編集/削除（contact_ids, start_at, status）
- 管理画面 Messages: user/assistant の会話記録と翻訳テキストを保存/閲覧
- 管理画面のAPI（/api/v1）: /contacts, /call_schedules, /call_logs, /call_logs/:id/messages
- 管理画面のAPI（/api/v1）: /login, /logout, /refresh

## 管理画面のデータ定義（MVP）
### Call Logs
- status: up, down
- call_type: inbound, outbound
- 表示フィールド: id, contact_name, phone_number, call_type, status, created_at, updated_at

### Messages
- role: user, assistant
- 表示フィールド: content, translation, role, created_at

### Contacts
- 必須フィールド: phone_number
- 表示/編集フィールド: name, phone_number, address, description, created_at, updated_at

### Call Schedules
- status: failed, pending, processing, completed, canceled, no_answer
- 表示フィールド: id, contact_name, phone_number, status, start_at, created_at, updated_at
- 作成フィールド: contact_ids, status, start_at
- 更新フィールド: status, start_at

## 管理画面の画面仕様（MVP）
### 認証
- ログイン: email/passwordで認証、成功時にトークン保存
- トークン更新: 401時に /refresh を実行し再試行
- ログアウト: /logout 実行でセッション破棄

### Home
- 目的: 進行中通話の監視
- 一覧: call_logs（status=up）
- 更新: 5秒ポーリング
- 操作: 会話詳細の表示

### Call Logs
- 一覧: call_logs（全件）
- フィルタ: status（APIクエリ）
- フィルタ: テーブル内の全文検索（クライアント側）
- 並び順: created_at 降順（新しい通話が上）
- 操作: 行選択/コンテキストメニューから会話詳細を表示
- 会話詳細: message一覧とtranslationの表示切替
- 会話詳細の並び順: created_at 昇順（古い発話が上）

### Contacts
- 一覧: contacts
- フィルタ: phone_number（APIクエリ）
- 操作: 作成/編集/削除
- 入力バリデーション: phone_numberは数字のみ

### Call Schedules
- 一覧: call_schedules
- フィルタ: phone_number, status, date_range（APIクエリ）
- 操作: 作成/編集/削除
- 作成: contact_idsの複数選択、statusとstart_atを指定
- 更新: statusとstart_atを更新

## スコープ外（Phase 2以降）
- 管理ユーザーの権限管理（RBAC）とユーザー管理
- 監査ログ、変更履歴、データエクスポート/インポート
- 高度な分析ダッシュボード（KPI可視化の自動化）

## 成功指標（KPI）
- 注文完了率（注文確定/通話開始）
- 途中離脱率（無音終了・拒否）
- 管理画面の運用効率（連絡先/通話予定の更新時間）

## 前提
- 在庫/価格/配送日は必ずツール結果を使用する
- 管理画面は認証必須で /api/v1 を利用する
- 通話ログは phone_number で連絡先に紐付く
- 無音検知は7秒、リトライ2回（MVP default）
- STT信頼度閾値は0.55（MVP default）
- ツールタイムアウトは getStock/getPrice 4秒、getDeliveryDate 6秒（MVP default）

## 未決事項（担当/期限）
- OQ-001〜OQ-009は確定済み（docs/OpenQuestions.md）
