# ADR 0002: 管理画面のフィルタと表示順の定義

## Status
Accepted

## Context
管理画面の一覧・詳細で、APIフィルタ条件と表示順が未定義だと実装や運用で差異が生まれる。既存APIと画面構成に合わせ、MVPの挙動を明記する必要がある。

## Decision
- Call Logs 一覧は status をAPIクエリでフィルタ可能とし、並び順は created_at 降順とする。
- Call Logs の会話詳細は messages を created_at 昇順で表示する。
- Contacts 一覧は phone_number をAPIクエリでフィルタ可能とする。
- Call Schedules 一覧は phone_number, status, date_range をAPIクエリでフィルタ可能とする。

## Consequences
- PRDにフィルタ条件と表示順を明記する
- API側のフィルタ条件と画面仕様の不整合を防ぐ
