# このリポジトリを「通しで動かす」ための必要ツール

## 必須
1. Node.js 18 以上 + npm
   - `ws-gateway` / `voip-client` は `tsx` を利用し、Node.js `>=18.0.0` が必要。

2. Twilio（アカウント、TwiML App、APIキー）
   - `voip-client` のトークン発行と通話テストに必須。

3. ngrok
   - Twilio からローカルの `voip-client` / `ws-gateway` へ到達させるために必須。

4. OpenAI API Key
   - `ws-gateway` が Realtime API に接続するために必須。

5. SQLite（別途DBサーバ不要）
   - `better-sqlite3` 経由でローカルDBファイルを利用。

6. ブラウザ（マイク利用）
   - `voip-client` の発着信テストに必須。

## 任意（デバッグ/運用補助）
1. bash
2. jq
3. rg（ripgrep）

- `ws-gateway/scripts/extract_last_call_conv.sh` を使う場合に必要。
