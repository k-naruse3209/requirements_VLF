# Spec: 001-voip-test-client

## User Scenarios & Why
- 開発者がPSTNの通話料金を抑えつつ、ブラウザから発着信の疎通確認をしたい。
- Twilio Voice SDKからMedia Streams経由でWSゲートウェイに音声が届くことを確認したい。

## Acceptance Scenarios (Given/When/Then)
1. Given `voip-client` が起動している, When `/token` を呼ぶ, Then Twilio Voice SDK用のJWTが返る。
2. Given ブラウザでInitを押す, When Deviceが登録される, Then `Device registered` が表示される。
3. Given `STREAM_URL` がWSゲートウェイに向いている, When Callを開始する, Then `POST /voice` が受信され、Media Streamsが開始される。

## Edge Cases
- `.env` が未設定の場合は `/token` が 500 を返す。
- ngrok URLが無効/停止中の場合は Twilio からの `/voice` が到達しない。
- Twilio SDK CDNがブロックされる場合はローカル配信に切り替える。

## Out of Scope
- PSTN品質の検証（本番電話番号からの通話）
- 本番向けの認証/課金/通話記録の永続化
