# 仕様（SSOT）

## 概要
- 本ファイルは仕様の正本（Single Source of Truth）。
- 変更は docs/inbox_delta.md を入力として統合する。
- 詳細は docs/ConversationSpec.md を参照する。

## 対象システム
- 音声販売AIの会話状態機械（MVP）。

## 会話フロー（要約）
- ST_Greeting -> ST_RequirementCheck -> ST_ProductSuggestion -> ST_StockCheck -> ST_PriceQuote -> ST_AddressCollect -> ST_DeliveryCheck -> ST_OrderConfirmation -> ST_Closing

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
- EX_Silence: 無音5秒で発火、最大3回リトライ後にST_Closing。復帰は元状態。
- EX_NoHear: STT信頼度0.6未満で発火、2回失敗でST_Closing。復帰は元状態。
- EX_Correction: キーワード検知で ST_RequirementCheck または ST_ProductSuggestion に戻る。

## 影響範囲
- API: 在庫/価格/配送日の取得ツール
- DB: 注文確定時の永続化
- UI: 音声応答フロー
- 運用: OpenQuestionの解消と仕様更新
