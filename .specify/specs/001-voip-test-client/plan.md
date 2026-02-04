# Implementation Plan: 001-voip-test-client

## Tech & Constraints
- Node.js + TypeScript
- Twilio Voice JavaScript SDK（ローカル配信）
- Twilio SDK for token generation（server側）
- ngrok Freeは同時トンネル1本の制限あり

## Data Model (if any)
- なし（トークンはオンデマンド発行）

## APIs / Interfaces
- GET `/token` → `{ token: <JWT> }`
- POST `/voice` → TwiML（`<Start><Stream url="..."/></Start>`）
- GET `/twilio.min.js` → Twilio Voice SDK（ローカル配信）
- GET `/` / `/app.js` → デモUI

## Execution Flow
- Phase 1: token APIとデモUIを実装
- Phase 2: `/voice` でTwiMLを返し、STREAM_URLへ接続
- Phase 3: ngrok公開でTwilioのVoice URLを設定し、疎通確認

## Risks & Mitigations
- ngrokの同時トンネル制限 → 8080/3001を切り替えて検証
- SDK CDNブロック → ローカル配信で回避
- 認証情報漏洩 → `.env` に集約し共有禁止
