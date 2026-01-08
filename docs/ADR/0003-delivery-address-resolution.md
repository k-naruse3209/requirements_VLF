# ADR 0003: 配送先住所の解決順序

## Status
Accepted

## Context
配送日取得（getDeliveryDate）には address が必要だが、ConversationSpec では取得手段が明確でない。管理画面には contacts.address が存在するため、運用上は既存データの活用が望ましい。

## Decision
ST_DeliveryCheck の実行前に address を解決する。優先順位は以下。
1. CallLog.phone_number に紐づく Contact.address を利用
2. Contact.address が空の場合は通話中に住所を聞き取り、確認後に利用

## Consequences
- 配送日取得の前に住所の参照/確認が必要となる
- 住所が未取得の場合は通話中に住所確認を行う
