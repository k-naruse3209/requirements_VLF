# ADR 0004: テレフォニーとWSゲートウェイの選定

## Status
Accepted

## Context
音声販売AIはOpenAI Realtime APIを利用するため、テレフォニーとWS中継の設計がMVP成否に直結する。最短で動かすことを優先し、既存運用スタックとの親和性も確保したい。

## Decision
- テレフォニーは Twilio Media Streams を採用し、音声は μ-law 8kHz / G.711 PCMU で送受信する。
- WSゲートウェイは Node.js（TypeScript）で実装する。
- コーデック変換（ffmpeg等）はMVPでは導入せず、PCM24kが必要な段階で追加する。
- 日本番号の取得/規制はTwilioの一次情報に基づいて進める。

## Consequences
- 音声フォーマットはPCMUで統一し、変換レイヤーを持たない。
- WSゲートウェイの運用が追加される。
