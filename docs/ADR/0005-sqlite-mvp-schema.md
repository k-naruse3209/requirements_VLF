---
status: accepted
date: 2026-01-26
---

# 0005: SQLite for MVP storage

## Context
MVPで通話ログ・会話履歴・評価メモ・文字起こしを永続化する必要がある。
運用・導入コストを最小化したい。

## Decision
MVPの永続化DBはSQLiteを採用する。IDはULID（TEXT）、時刻はUTCのISO-8601文字列。

## Consequences
- 単一ノードでの運用が前提となる。
- 将来PostgreSQL等に移行する場合はDDL/インデックス設計を見直す。
- スキーマは `docs/DBSchema.sql` をSSOTとする。
