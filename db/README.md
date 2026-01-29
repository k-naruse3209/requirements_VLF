# vlf-db

SQLiteの最小データレイヤー。ULID/UTCで永続化します。

## Usage
```js
import { createDb, applySchema, createRepositories } from "./src/index.js";

const db = createDb({ filename: "data/app.db" });
applySchema(db);
const repos = createRepositories(db);
```
