# Local Proxy (ngrok 1本用)

Freeプランのngrokで `voip-client` と `ws-gateway` を1本に集約するためのローカルプロキシ。

## 使い方
1) `voip-client` を起動（3001）
2) `ws-gateway` を起動（8080）
3) 本プロキシを起動（4000）
4) ngrok は 4000 を公開

## 起動
```bash
npm install
npm run dev
```

## ルーティング
- `https://<ngrok>/voice` → `voip-client:3001/voice`
- `https://<ngrok>/` → `voip-client:3001/`
- `wss://<ngrok>/stream` → `ws-gateway:8080`
