# VoIP Test Client

Twilio Voice JavaScript SDKでブラウザ発着信テストを行うための最小構成です。

## SSOT
- 実行エントリは `src/server.ts`（手編集ソース）です。
- 起動は `npm run dev`（`tsx src/server.ts`）を使用します。

## 事前準備
1. Twilio ConsoleでTwiML Appを作成
2. Voice URLは `https://<ngrok>/voice` を設定（proxy経由）
3. `.env` の `STREAM_URL` に `wss://<ngrok>/stream` を設定

## 環境変数
`.env.example` をコピーして `.env` を作成し、Twilioの値を設定します。

```
ACCOUNT_SID=AC...
API_KEY_SID=SK...
API_KEY_SECRET=...
APP_SID=AP...
CLIENT_ID=browser
PORT=3001
STREAM_URL=wss://your-ngrok.example.com/stream
```

## 起動
```bash
npm install
npm run dev
```

ブラウザで `http://localhost:3001` を開き、Init → Call の順でテストします。
