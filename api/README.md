# vlf-api

管理APIの最小実装。SQLiteを使用します。

## SSOT
- 実行エントリは `src/server.js`（手編集ソース）です。
- このディレクトリでは TypeScript ビルド運用はしていません。

## Env
- DB_PATH
- PORT
- JWT_SECRET
- ACCESS_TTL_MINUTES (MVP default: 15)
- REFRESH_TTL_DAYS (MVP default: 30)

## Initialize DB
```
npm run init-db
```

## Seed admin user
```
ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_NAME=... npm run seed-admin
```

## Run
```
npm run dev
```
