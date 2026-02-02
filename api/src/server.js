import crypto from "node:crypto";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createDb, createRepositories } from "../../db/src/index.js";

const dbPath = process.env.DB_PATH;
if (!dbPath) {
  throw new Error("DB_PATH is required");
}

const db = createDb({ filename: dbPath });
const repos = createRepositories(db);

const app = express();
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const ok = (res, data) => res.json({ success: true, data });

const mapContact = (row) => ({
  id: String(row.id),
  type: "contact",
  attributes: row,
});

const mapCallLog = (row) => ({
  id: String(row.id),
  type: "call_log",
  attributes: {
    id: row.id,
    contact_name: row.contact_name ?? null,
    phone_number: row.contact_phone ?? row.from_number ?? null,
    status: row.status ?? null,
    call_type: row.call_type ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  },
});

const mapMessage = (row) => ({
  id: String(row.id),
  type: "message",
  attributes: {
    id: row.id,
    call_log_id: row.call_id,
    content: row.text,
    translation: row.translation ?? null,
    role: row.speaker,
    created_at: row.created_at,
    updated_at: row.created_at,
  },
});

const mapCallSchedule = (row) => ({
  id: String(row.id),
  type: "call_schedule",
  attributes: {
    id: row.id,
    start_at: row.start_at,
    status: row.status,
    contact_name: row.contact_name,
    phone_number: row.contact_phone,
    created_at: row.created_at,
    updated_at: row.updated_at,
  },
});

const mapRiceInquiry = (row) => ({
  id: String(row.id),
  type: "rice_inquiry",
  attributes: row,
});

const mapNote = (row) => ({
  id: String(row.id),
  type: "note",
  attributes: row,
});

const mapTag = (row) => ({
  id: String(row.id),
  type: "tag",
  attributes: row,
});

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error("JWT_SECRET is required");
}

const accessTtlMinutes = Number(process.env.ACCESS_TTL_MINUTES || "15");
const refreshTtlDays = Number(process.env.REFRESH_TTL_DAYS || "30");

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
const randomContactKey = () =>
  `unknown-${crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(8).toString("hex")}`;

const signAccessToken = (payload) =>
  jwt.sign(payload, jwtSecret, { expiresIn: `${accessTtlMinutes}m` });

const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, jwtSecret);
  } catch {
    return null;
  }
};

const requireAuth = (req, res, next) => {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const token = header.slice("Bearer ".length);
  const payload = verifyAccessToken(token);
  if (!payload) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  req.auth = payload;
  next();
};

const buildRefreshExpiry = () => {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + refreshTtlDays);
  return now.toISOString();
};

app.post("/api/v1/login", (req, res) => {
  const payload = req.body?.session || req.body || {};
  const { email, password } = payload;
  if (!email || !password) {
    res.status(400).json({ error: "invalid_credentials" });
    return;
  }
  const operator = repos.operators.findByEmail(email);
  if (!operator) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const isValid = bcrypt.compareSync(password, operator.password_hash);
  if (!isValid) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const accessToken = signAccessToken({
    sub: operator.id,
    role: operator.role || "operator",
    email: operator.email,
    user_id: operator.id,
  });
  const refreshToken = crypto.randomBytes(48).toString("hex");
  repos.authSessions.create({
    operatorId: operator.id,
    refreshTokenHash: hashToken(refreshToken),
    expiresAt: buildRefreshExpiry(),
  });
  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    sameSite: "lax",
  });
  ok(res, { token: accessToken });
});

app.post("/api/v1/refresh", (req, res) => {
  const refreshToken = req.cookies?.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const session = repos.authSessions.findByTokenHash(hashToken(refreshToken));
  if (!session) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    repos.authSessions.revoke(session.id);
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const operator = repos.operators.findById(session.operator_id);
  if (!operator) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const accessToken = signAccessToken({
    sub: operator.id,
    role: operator.role || "operator",
    email: operator.email,
    user_id: operator.id,
  });
  ok(res, { token: accessToken });
});

app.post("/api/v1/logout", (req, res) => {
  const refreshToken = req.cookies?.refresh_token;
  if (refreshToken) {
    const session = repos.authSessions.findByTokenHash(hashToken(refreshToken));
    if (session) {
      repos.authSessions.revoke(session.id);
    }
  }
  res.clearCookie("refresh_token");
  res.status(204).end();
});

app.get("/api/v1/contacts", requireAuth, (req, res) => {
  const contacts = repos.contacts.list({ phoneNumber: req.query.phone_number });
  ok(res, contacts.map(mapContact));
});

app.post("/api/v1/contacts", requireAuth, (req, res) => {
  const payload = req.body?.contact || req.body || {};
  const id = repos.contacts.create({
    name: payload.name,
    phoneNumber: payload.phone_number,
    address: payload.address,
    description: payload.description,
  });
  const contact = repos.contacts.findByPhone(payload.phone_number);
  res.status(201).json({ success: true, data: mapContact(contact || { id }) });
});

app.put("/api/v1/contacts/:id", requireAuth, (req, res) => {
  const payload = req.body?.contact || req.body || {};
  repos.contacts.update({
    id: req.params.id,
    name: payload.name,
    phoneNumber: payload.phone_number,
    address: payload.address,
    description: payload.description,
  });
  const updated = payload.phone_number ? repos.contacts.findByPhone(payload.phone_number) : null;
  res.json({ success: true, data: mapContact(updated || { id: req.params.id }) });
});

app.delete("/api/v1/contacts/:id", requireAuth, (req, res) => {
  repos.contacts.delete(req.params.id);
  res.json({ success: true });
});

app.get("/api/v1/call_logs", requireAuth, (req, res) => {
  const calls = repos.calls.listWithContacts({
    status: req.query.status,
    customerId: req.query.customer_id,
    startFrom: req.query.start_from,
    startTo: req.query.start_to,
  });
  ok(res, calls.map(mapCallLog));
});

app.post("/api/v1/call_logs", (req, res) => {
  const payload = req.body || {};
  let customerId = payload.customer_id;
  if (!customerId) {
    const phone = payload.from_number || payload.to_number || payload.provider_call_sid;
    if (phone) {
      const existing = repos.contacts.findByPhone(phone);
      if (existing) {
        customerId = existing.id;
      } else {
        customerId = repos.contacts.create({
          name: "Guest",
          phoneNumber: phone,
          address: null,
          description: "auto-created",
        });
      }
    }
  }
  if (!customerId) {
    customerId = repos.contacts.create({
      name: "Guest",
      phoneNumber: randomContactKey(),
      address: null,
      description: "auto-created",
    });
  }
  const id = repos.calls.create({
    customerId,
    startedAt: req.body.started_at,
    fromNumber: req.body.from_number,
    toNumber: req.body.to_number,
    callType: req.body.call_type,
    status: req.body.status,
    provider: req.body.provider,
    providerCallSid: req.body.provider_call_sid,
  });
  const row = repos.calls.findWithContact(id);
  res.status(201).json({ success: true, data: mapCallLog(row || { id }) });
});

app.put("/api/v1/call_logs/:id", (req, res) => {
  repos.calls.finish({
    id: req.params.id,
    endedAt: req.body.ended_at,
    durationSec: req.body.duration_sec,
    status: req.body.status,
  });
  const row = repos.calls.findWithContact(req.params.id);
  res.json({ success: true, data: row ? mapCallLog(row) : null });
});

app.delete("/api/v1/call_logs/:id", requireAuth, (req, res) => {
  repos.calls.delete(req.params.id);
  res.json({ success: true });
});

app.get("/api/v1/call_logs/:id/messages", requireAuth, (req, res) => {
  const messages = repos.utterances.listByCallId(req.params.id);
  const callLog = repos.calls.findWithContact(req.params.id);
  res.json({
    success: true,
    data: {
      messages: messages.map(mapMessage),
      call_log: callLog ? mapCallLog(callLog) : null,
    },
  });
});

app.post("/api/v1/call_logs/:id/messages", (req, res) => {
  const id = repos.utterances.create({
    callId: req.params.id,
    speaker: req.body.role,
    text: req.body.content,
    translation: req.body.translation,
    startedAt: req.body.started_at,
    endedAt: req.body.ended_at,
  });
  res.status(201).json({ success: true, data: { id } });
});

app.post("/api/v1/rice_inquiries", (req, res) => {
  const payload = req.body || {};
  if (!payload.call_id) {
    res.status(400).json({ error: "call_id_required" });
    return;
  }
  const id = repos.riceInquiries.upsert({
    callId: payload.call_id,
    brand: payload.brand,
    weightKg: payload.weight_kg,
    deliveryAddress: payload.delivery_address,
    deliveryDate: payload.delivery_date,
    note: payload.note,
  });
  const row = repos.riceInquiries.findByCallId(payload.call_id);
  res.status(201).json({ success: true, data: row ? mapRiceInquiry(row) : { id } });
});

app.get("/api/v1/call_logs/:id/notes", requireAuth, (req, res) => {
  const notes = repos.notes.listByCallId(req.params.id);
  ok(res, notes.map(mapNote));
});

app.post("/api/v1/call_logs/:id/notes", requireAuth, (req, res) => {
  const id = repos.notes.create({
    callId: req.params.id,
    authorId: req.auth?.sub,
    score: req.body.score,
    category: req.body.category,
    memo: req.body.memo,
  });
  res.status(201).json({ success: true, data: { id } });
});

app.get("/api/v1/notes", requireAuth, (req, res) => {
  const notes = repos.notes.listByFilters({
    authorId: req.query.author_id,
    category: req.query.category,
    scoreMin: req.query.score_min ? Number(req.query.score_min) : undefined,
    scoreMax: req.query.score_max ? Number(req.query.score_max) : undefined,
  });
  ok(res, notes.map(mapNote));
});

app.get("/api/v1/call_logs/:id/tags", requireAuth, (req, res) => {
  const tags = repos.tags.listByCallId(req.params.id);
  ok(res, tags.map(mapTag));
});

app.post("/api/v1/call_logs/:id/tags", requireAuth, (req, res) => {
  const name = req.body.name;
  if (!name) {
    res.status(400).json({ error: "tag_name_required" });
    return;
  }
  const tagId = repos.tags.upsert(name);
  repos.tags.attachToCall(req.params.id, tagId);
  res.status(201).json({ success: true, data: { id: tagId } });
});

app.get("/api/v1/call_schedules", requireAuth, (req, res) => {
  const schedules = repos.callSchedules.listByFilters({
    status: req.query.status,
    phoneNumber: req.query.phone_number,
    startFrom: req.query.start_from,
    startTo: req.query.start_to,
  });
  ok(res, schedules.map(mapCallSchedule));
});

app.post("/api/v1/call_schedules", requireAuth, (req, res) => {
  const payload = req.body?.call_schedule || req.body || {};
  const contactIds = payload.contact_ids || (payload.contact_id ? [payload.contact_id] : []);
  if (!Array.isArray(contactIds) || contactIds.length === 0) {
    res.status(400).json({ error: "contact_ids_required" });
    return;
  }
  const ids = contactIds.map((contactId) =>
    repos.callSchedules.create({
      contactId,
      status: payload.status,
      startAt: payload.start_at,
    })
  );
  const rows = repos.callSchedules.listByFilters({}) || [];
  const created = rows.filter((row) => ids.includes(row.id));
  res.status(201).json({ success: true, data: created.map(mapCallSchedule) });
});

app.put("/api/v1/call_schedules/:id", requireAuth, (req, res) => {
  const payload = req.body?.call_schedule || req.body || {};
  repos.callSchedules.update({
    id: req.params.id,
    status: payload.status,
    startAt: payload.start_at,
  });
  const row = repos.callSchedules.listByFilters({}).find((item) => item.id === req.params.id);
  res.json({ success: true, data: row ? mapCallSchedule(row) : null });
});

app.delete("/api/v1/call_schedules/:id", requireAuth, (req, res) => {
  repos.callSchedules.delete(req.params.id);
  res.json({ success: true });
});

const port = process.env.PORT;
const host = process.env.HOST || "0.0.0.0";
if (!port) {
  throw new Error("PORT is required");
}
app.listen(Number(port), host, () => {
  console.log(`API listening on ${host}:${port}`);
});
