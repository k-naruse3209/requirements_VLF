---
status: accepted
date: 2026-01-26
---

# 0008: Admin API auth scheme (JWT + refresh cookie)

## Context
管理APIの認証方式が未定で、管理画面のログイン/更新/ログアウトの実装方針が必要。

## Decision
MVPの管理APIは以下を採用する。
- Access token: JWT（MVP default 15分）
- Refresh token: HTTP-only cookie（MVP default 30日）
- refresh_token はDBにハッシュ保存

## Consequences
- 実装はシンプルで、管理画面側のトークン更新が容易になる。
- 期限や失効ポリシーは運用データに基づいて再調整する。
