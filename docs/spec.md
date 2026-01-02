# 仕様（SSOT）

## 概要
- 本ファイルは仕様の正本（Single Source of Truth）。
- 変更は docs/inbox_delta.md を入力として統合する。
- 詳細は docs/ConversationSpec.md を参照する。

## 参照
- 詳細仕様: docs/ConversationSpec.md
- 未決一覧: docs/open_questions.md
- 決定事項: docs/decisions.md

## 対象システム
- 音声販売AIの会話状態機械（MVP）。

## 会話フロー（要約）
- ST_Greeting -> ST_RequirementCheck -> ST_ProductSuggestion -> ST_StockCheck -> ST_PriceQuote -> ST_AddressCollect -> ST_DeliveryCheck -> ST_OrderConfirmation -> ST_Closing

## 主要遷移（要約）
- 在庫なし: ST_StockCheck -> ST_ProductSuggestion
- 価格拒否: ST_PriceQuote -> ST_ProductSuggestion
- 配送日拒否: ST_DeliveryCheck -> ST_Closing
- 注文確定: ST_OrderConfirmation（「はい」）で永続化して ST_Closing

## 状態と必須スロット（要約）
- ST_ProductSuggestion: productId
- ST_StockCheck: productId
- ST_PriceQuote: productId, price, currency
- ST_AddressCollect: address
- ST_DeliveryCheck: productId, address, deliveryDate
- ST_OrderConfirmation: productId, price, currency, deliveryDate

## ツール利用（要約）
- getStock: productId -> available/quantity
- getPrice: productId -> price/currency
- getDeliveryDate: productId + address -> deliveryDate/estimatedDays

## ガード
- 価格/在庫/配送日はツール結果のみを使用し、推測しない。取得不能時は OpenQuestion。

## 例外
- EX_Silence: 無音5秒で発火、最大3回リトライ後にST_Closing。復帰は元状態（OQ-001/OQ-002）。
- EX_NoHear: STT信頼度0.6未満で発火、2回失敗でST_Closing。復帰は元状態（OQ-004/OQ-005）。
- EX_Correction: キーワード検知で ST_RequirementCheck または ST_ProductSuggestion に戻る。

## 永続化
- 注文は ST_OrderConfirmation で「はい」を受信した時点でDBに保存する。

## 受け入れテスト（要約）
- 主要フローは ST_Greeting から ST_Closing まで到達する。
- 住所取得は ST_AddressCollect で完了し、配送確認に進む。
- 在庫なし/価格拒否/配送日拒否の分岐は所定の遷移に従う。
- EX_Silence/EX_NoHear のリトライ上限で ST_Closing に到達する。

## 影響範囲
- API: 在庫/価格/配送日の取得ツール
- DB: 注文確定時の永続化
- UI: 音声応答フロー
- 運用: OpenQuestionの解消と仕様更新
