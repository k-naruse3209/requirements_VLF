# ADR 0009: WSゲートウェイでのPCMU変換をMVP要件とする

## Status
Accepted

## Supersedes
ADR-0004（テレフォニーとWSゲートウェイの選定）の「コーデック変換はMVPでは導入せず」「変換レイヤーを持たない」の記述を部分的に上書きする。

## Context
ADR-0004では「音声フォーマットはPCMUで統一し、変換レイヤーを持たない」と決定した。しかし実装では `REALTIME_AUDIO_MODE` により Realtime 側フォーマットを切り替える必要がある。`REALTIME_AUDIO_MODE=pcm16` の場合、Twilio Media Streamsが要求するPCMU（μ-law 8kHz / G.711）とRealtimeのPCM16（16-bit linear PCM）で不一致が発生するため、ゲートウェイ内変換が必須となる。`REALTIME_AUDIO_MODE=pcmu` の場合はPCMUでのパススルー運用が可能。

## Decision
- `REALTIME_AUDIO_MODE` は `pcmu` / `pcm16` をサポートし、デフォルトは `pcmu` とする。
- `REALTIME_AUDIO_MODE=pcmu` のときは、Twilio(PCMU/8kHz) と Realtime(g711_ulaw) を変換なしで接続する。
- `REALTIME_AUDIO_MODE=pcm16` のときは、WSゲートウェイで双方向変換を行う:
  - Twilio -> Realtime: PCMUデコード + 8kHz->Realtime指定レートへアップサンプル
  - Realtime -> Twilio: Realtime出力PCM16を8kHzへダウンサンプル + μ-lawエンコード
- 変換はTwilio送受信直前の最小限の処理に限定し、ffmpeg等の外部プロセスは使わず、ゲートウェイ内のインメモリ処理で実装する。
- Twilio向け送信音声は常にPCMU（μ-law 8kHz）を満たす。

## Consequences
- ADR-0004の「変換レイヤーを持たない」方針はMVP内で緩和され、必要最小限のフォーマット変換はWSゲートウェイの責務に含まれる。
- `REALTIME_AUDIO_MODE` による運用切替（`pcmu` / `pcm16`）が可能になる。
- 変換処理はゲートウェイ内で完結し、外部依存は増えない。
- DetailedDesign.md の音声要件（Twilio向けPCMU保証、`REALTIME_AUDIO_MODE` 分岐）と整合する。
