---
status: accepted
date: 2026-01-26
---

# 0006: SQLite driver for MVP

## Context
MVPのSQLite永続化を実装するため、Node.jsで扱いやすいドライバ選定が必要。

## Decision
MVPのSQLiteドライバは `better-sqlite3` を採用する。

## Consequences
- 同期APIで実装が単純になる。
- 将来、非同期I/Oが必要になった場合はドライバの差し替えを検討する。
