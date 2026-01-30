---
status: accepted
date: 2026-01-26
---

# 0007: API framework for MVP

## Context
管理APIを最小構成で実装し、VoIP/管理画面と接続できる必要がある。

## Decision
MVPの管理APIは Node.js の Express で実装する。

## Consequences
- 実装がシンプルになり、DBリポジトリ層と接続しやすい。
- 後続でフレームワーク変更を行う場合はルーティングとミドルウェア設計を見直す。
