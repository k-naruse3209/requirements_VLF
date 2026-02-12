import { createDb, applySchema } from "../../db/src/index.js";

const dbPath = process.env.DB_PATH;
if (!dbPath) {
  throw new Error("DB_PATH is required");
}

const db = createDb({ filename: dbPath });
applySchema(db);
db.close();
