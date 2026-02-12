# vlf-api

管理APIの最小実装。SQLiteを使用します。

## Env
- DB_PATH
- PORT
- JWT_SECRET
- ACCESS_TTL_MINUTES (MVP default: 15)
- REFRESH_TTL_DAYS (MVP default: 30)

## Initialize DB
```
node src/init-db.js
```

## Seed admin user
```
ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_NAME=... node src/seed-admin.js
```

## Run
```
node src/server.js
```
