# ADR 0001: 管理画面（linguaflow-admin）をMVP仕様に含める

## Status
Accepted

## Context
音声販売AIのMVP要件をSSOTとして整理するにあたり、既存の管理画面（linguaflow-admin）が運用上必須となっている。管理画面の機能とAPI範囲をPRDに取り込み、仕様の一貫性を確保する必要がある。

## Decision
MVP仕様に管理画面（linguaflow-admin）の機能範囲を含める。対象は認証、進行中通話一覧、通話ログと会話詳細、連絡先管理、通話予定管理、会話メッセージ表示とする。管理画面は /api/v1 の既存APIを利用する。

## Consequences
- PRDに管理画面の機能範囲とAPIエンドポイントを明記する
- 役割/権限管理や監査ログなどはPhase 2以降の扱いとする
