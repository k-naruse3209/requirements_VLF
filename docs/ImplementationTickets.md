# Implementation Tickets（実装チケット分解）
Version: 0.1 (MVP)
SSOT: docs/ImplementationTickets.md

## 参照
- docs/PRD.md
- docs/ConversationSpec.md
- docs/DetailedDesign.md

## チケット一覧（MVP）
### A. 音声販売AI（会話オーケストレータ）
1. 状態機械の実装（ST_Greeting〜ST_Closing、EX_*）
   - 受け入れ条件: ConversationSpecの遷移表と一致する
2. STT/無音検知/聞き取り失敗の例外処理
   - 受け入れ条件: EX_Silence/EX_NoHear/EX_Correctionの挙動が一致
3. ツール連携（getStock/getPrice/getDeliveryDate/saveOrder）
   - 受け入れ条件: 各ツールの入力/出力/タイムアウト/エラー動作が一致
4. 配送先住所の解決（Contact.address優先、未取得時の確認）
   - 受け入れ条件: ADR 0003に準拠
5. 注文保存のトランザクション処理
   - 受け入れ条件: saveOrder失敗時のリトライ1回とエラー終了
6. テレフォニー連携（Twilio Media Streams）
   - 受け入れ条件: PCMU/8kHzでWSゲートウェイへ音声が流れる
7. WSゲートウェイ（Node.js/TypeScript）
   - 受け入れ条件: OpenAI Realtime APIと双方向で接続できる
8. 音声フォーマット（PCMU）
   - 受け入れ条件: 変換なしでエンドツーエンドに成立する

### B. 管理API（/api/v1）
9. SQLiteデータレイヤー（スキーマ/接続/リポジトリ）
   - 受け入れ条件: docs/DBSchema.sql に準拠しULID/UTCで永続化できる
10. 認証API（login/logout/refresh）
   - 受け入れ条件: トークン更新と401ハンドリングが設計通り
11. Contacts API（CRUD + phone_number filter）
   - 受け入れ条件: PRDのデータ定義と一致
12. Call Logs API（list/status filter + create/update + delete）
   - 受け入れ条件: auth要否とフィルタが設計通り
13. Messages API（call_logs/:id/messages のlist/create）
   - 受け入れ条件: auth要否が設計通り
14. Call Schedules API（CRUD + phone_number/status/date_range filter）
   - 受け入れ条件: PRDのフィルタ要件と一致

### C. 管理画面（linguaflow-admin）
15. 認証フロー（login/refresh/logout）
   - 受け入れ条件: 未認証時のリダイレクトと401時の更新
16. Home（進行中通話一覧、ポーリング）
   - 受け入れ条件: status=upのみ、5秒更新
17. Call Logs 一覧・詳細
   - 受け入れ条件: 一覧はcreated_at降順、詳細はcreated_at昇順
18. Contacts 管理（作成/編集/削除）
   - 受け入れ条件: phone_numberの入力制約（数字のみ）
19. Call Schedules 管理（作成/編集/削除）
   - 受け入れ条件: contact_ids複数選択、status/start_at設定

### D. 運用・監視
20. エラーログ記録（ツール/管理API/認証）
   - 受け入れ条件: 失敗時に必要情報が記録される
21. KPI計測の基本ログ
   - 受け入れ条件: 注文完了率/離脱率/例外率の集計に必要なイベントが揃う
