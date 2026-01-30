import bcrypt from "bcryptjs";
import { createDb, createRepositories } from "../../db/src/index.js";

const dbPath = process.env.DB_PATH;
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME || "Admin";

if (!dbPath || !email || !password) {
  throw new Error("DB_PATH, ADMIN_EMAIL, ADMIN_PASSWORD are required");
}

const db = createDb({ filename: dbPath });
const repos = createRepositories(db);

const existing = repos.operators.findByEmail(email);
if (existing) {
  console.log("admin exists");
  process.exit(0);
}

const passwordHash = bcrypt.hashSync(password, 10);
repos.operators.create({
  name,
  email,
  passwordHash,
  role: "admin",
});

console.log("admin created");
