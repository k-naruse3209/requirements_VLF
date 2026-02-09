# requirements_VLF_codex_realtime_verbatim

Twilio + Realtime API + WS gateway + Admin API で構成された音声注文システムです。

## SSOT
- `api`: `src/server.js` が起動エントリ（`npm run dev` / `npm run start`）
- `voip-client`: `src/server.ts` が起動エントリ（`npm run dev`）
- `proxy`: `src/index.js` が起動エントリ（`npm run dev`）
- `ws-gateway`: `src/index.ts` が起動エントリ（`npm run dev`）

## Ports

| Service | Env | Default | 用途 |
|---|---|---:|---|
| API | `PORT` | `3100` | 管理API、注文保存 |
| VoIP Client | `PORT` | `3001` | Twilio Voice SDK UI と TwiML |
| WS Gateway | `WS_PORT` | `8080` | Twilio Media Streams 受信 + Realtime 接続 |
| Local Proxy | `PROXY_PORT` | `4000` | ngrok一本化（HTTP/WS） |
| ngrok | - | - | `http://localhost:4000` を公開 |

## 起動手順（新規メンバー向け）

### 1) API
```bash
cd api
npm install
npm run init-db
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=pass ADMIN_NAME=Admin npm run seed-admin
PORT=3100 JWT_SECRET=dev-secret npm run dev
```

### 2) WS Gateway
```bash
cd ws-gateway
npm install
OPENAI_API_KEY=<your_key> \
LOG_API_BASE_URL=http://127.0.0.1:3100 \
REALTIME_MODEL=gpt-realtime \
REALTIME_SCHEMA=flat \
REALTIME_AUDIO_MODE=pcmu \
REALTIME_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe \
WS_PORT=8080 \
npm run dev
```

### 3) VoIP Client
```bash
cd voip-client
npm install
cp .env.example .env
```

`.env` 例:
```env
ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
API_KEY_SID=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
API_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
APP_SID=APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
CLIENT_ID=browser
PORT=3001
STREAM_URL=wss://<your-ngrok-domain>/stream
STREAM_STATUS_URL=https://<your-ngrok-domain>/twilio/stream-status
STREAM_MODE=connect
TWIML_VARIANT=keepalive
```

```bash
npm run dev
```

### 4) Proxy
```bash
cd proxy
npm install
PROXY_PORT=4000 VOIP_TARGET=http://127.0.0.1:3001 WS_TARGET=ws://127.0.0.1:8080 npm run dev
```

### 5) ngrok
```bash
ngrok http 4000
```

Twilio 側設定:
- Voice URL: `https://<your-ngrok-domain>/voice`
- Stream URL: `wss://<your-ngrok-domain>/stream`

## 開発用テスト手順

### WS Gateway（推奨）
```bash
cd ws-gateway
npm run verify
```

内訳:
- `npm run typecheck`
- `npm run test` (`npm run rice-test` + `npm run audio-test`)

### API（最小確認）
```bash
cd api
node --check src/server.js
node --check src/init-db.js
node --check src/seed-admin.js
```

## 実装上の決定（要点）
- `saveOrder` 呼び出し時は `address` 必須。住所未確定なら保存処理に進まない。
- Correction は専用状態を持たず、内部例外処理で `ST_RequirementCheck` に戻す。
- バージインは `input_audio_buffer.speech_started` で統一的に処理し、`response.cancel` と Twilio `clear` を冪等で実行する。
- Twilio送信直前の音声フォーマットは常に `audio/x-mulaw @ 8000Hz` を保証する。
