import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { ulid } from "ulid";

const toIso = (date = new Date()) => date.toISOString();

export const createDb = ({ filename }) => {
  if (!filename) {
    throw new Error("db filename is required");
  }
  return new Database(filename);
};

export const applySchema = (db, schemaPath) => {
  const resolved = schemaPath
    ? path.resolve(schemaPath)
    : path.resolve(process.cwd(), "../docs/DBSchema.sql");
  const sql = fs.readFileSync(resolved, "utf8");
  db.exec(sql);
};

export const createRepositories = (db) => {
  const calls = {
    create: (input) => {
      const id = ulid();
      const createdAt = toIso();
      const stmt = db.prepare(
        `INSERT INTO calls
         (id, customer_id, started_at, from_number, to_number, call_type, status, provider, provider_call_sid, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      stmt.run(
        id,
        input.customerId,
        input.startedAt,
        input.fromNumber ?? null,
        input.toNumber ?? null,
        input.callType ?? null,
        input.status ?? null,
        input.provider ?? null,
        input.providerCallSid ?? null,
        createdAt,
        createdAt
      );
      return id;
    },
    finish: (input) => {
      const stmt = db.prepare(
        `UPDATE calls
         SET ended_at = ?, duration_sec = ?, status = ?, updated_at = ?
         WHERE id = ?`
      );
      stmt.run(input.endedAt, input.durationSec ?? null, input.status ?? null, toIso(), input.id);
    },
    list: (filters = {}) => {
      const clauses = [];
      const params = [];
      if (filters.status) {
        clauses.push("status = ?");
        params.push(filters.status);
      }
      if (filters.customerId) {
        clauses.push("customer_id = ?");
        params.push(filters.customerId);
      }
      if (filters.startFrom) {
        clauses.push("started_at >= ?");
        params.push(filters.startFrom);
      }
      if (filters.startTo) {
        clauses.push("started_at <= ?");
        params.push(filters.startTo);
      }
      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      return db
        .prepare(`SELECT * FROM calls ${where} ORDER BY started_at DESC`)
        .all(...params);
    },
    findById: (id) => db.prepare("SELECT * FROM calls WHERE id = ?").get(id),
    listWithContacts: (filters = {}) => {
      const clauses = [];
      const params = [];
      if (filters.status) {
        clauses.push("calls.status = ?");
        params.push(filters.status);
      }
      if (filters.customerId) {
        clauses.push("calls.customer_id = ?");
        params.push(filters.customerId);
      }
      if (filters.startFrom) {
        clauses.push("calls.started_at >= ?");
        params.push(filters.startFrom);
      }
      if (filters.startTo) {
        clauses.push("calls.started_at <= ?");
        params.push(filters.startTo);
      }
      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      return db
        .prepare(
          `SELECT calls.*, contacts.name AS contact_name, contacts.phone_number AS contact_phone
           FROM calls
           LEFT JOIN contacts ON contacts.id = calls.customer_id
           ${where}
           ORDER BY calls.started_at DESC`
        )
        .all(...params);
    },
    findWithContact: (id) =>
      db
        .prepare(
          `SELECT calls.*, contacts.name AS contact_name, contacts.phone_number AS contact_phone
           FROM calls
           LEFT JOIN contacts ON contacts.id = calls.customer_id
           WHERE calls.id = ?`
        )
        .get(id),
    delete: (id) =>
      db.transaction(() => {
        db.prepare("DELETE FROM utterances WHERE call_id = ?").run(id);
        db.prepare("DELETE FROM transcripts WHERE call_id = ?").run(id);
        db.prepare("DELETE FROM rice_inquiries WHERE call_id = ?").run(id);
        db.prepare("DELETE FROM notes WHERE call_id = ?").run(id);
        db.prepare("DELETE FROM call_tags WHERE call_id = ?").run(id);
        db.prepare("DELETE FROM calls WHERE id = ?").run(id);
      })(),
  };

  const utterances = {
    create: (input) => {
      const id = ulid();
      const stmt = db.prepare(
        `INSERT INTO utterances
         (id, call_id, speaker, text, translation, started_at, ended_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      stmt.run(
        id,
        input.callId,
        input.speaker,
        input.text,
        input.translation ?? null,
        input.startedAt ?? null,
        input.endedAt ?? null,
        toIso()
      );
      return id;
    },
    listByCallId: (callId) =>
      db.prepare("SELECT * FROM utterances WHERE call_id = ? ORDER BY created_at ASC").all(callId),
  };

  const riceInquiries = {
    upsert: (input) => {
      const now = toIso();
      const existing = db.prepare("SELECT id FROM rice_inquiries WHERE call_id = ?").get(input.callId);
      if (existing) {
        db.prepare(
          `UPDATE rice_inquiries
           SET brand = ?, weight_kg = ?, delivery_address = ?, delivery_date = ?, note = ?, updated_at = ?
           WHERE call_id = ?`
        ).run(
          input.brand ?? null,
          input.weightKg ?? null,
          input.deliveryAddress ?? null,
          input.deliveryDate ?? null,
          input.note ?? null,
          now,
          input.callId
        );
        return existing.id;
      }
      const id = ulid();
      db.prepare(
        `INSERT INTO rice_inquiries
         (id, call_id, brand, weight_kg, delivery_address, delivery_date, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        input.callId,
        input.brand ?? null,
        input.weightKg ?? null,
        input.deliveryAddress ?? null,
        input.deliveryDate ?? null,
        input.note ?? null,
        now,
        now
      );
      return id;
    },
    findByCallId: (callId) =>
      db.prepare("SELECT * FROM rice_inquiries WHERE call_id = ?").get(callId),
  };

  const transcripts = {
    create: (input) => {
      const id = ulid();
      const stmt = db.prepare(
        `INSERT INTO transcripts
         (id, call_id, scope, text, language, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      stmt.run(id, input.callId, input.scope, input.text, input.language ?? null, toIso());
      return id;
    },
    listByCallId: (callId) =>
      db.prepare("SELECT * FROM transcripts WHERE call_id = ? ORDER BY created_at ASC").all(callId),
  };

  const notes = {
    create: (input) => {
      const id = ulid();
      const now = toIso();
      const stmt = db.prepare(
        `INSERT INTO notes
         (id, call_id, author_id, score, category, memo, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      stmt.run(
        id,
        input.callId,
        input.authorId ?? null,
        input.score ?? null,
        input.category ?? null,
        input.memo,
        now,
        now
      );
      return id;
    },
    listByCallId: (callId) => db.prepare("SELECT * FROM notes WHERE call_id = ?").all(callId),
    listByFilters: (filters = {}) => {
      const clauses = [];
      const params = [];
      if (filters.authorId) {
        clauses.push("author_id = ?");
        params.push(filters.authorId);
      }
      if (filters.category) {
        clauses.push("category = ?");
        params.push(filters.category);
      }
      if (filters.scoreMin != null) {
        clauses.push("score >= ?");
        params.push(filters.scoreMin);
      }
      if (filters.scoreMax != null) {
        clauses.push("score <= ?");
        params.push(filters.scoreMax);
      }
      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      return db.prepare(`SELECT * FROM notes ${where} ORDER BY created_at DESC`).all(...params);
    },
  };

  const tags = {
    upsert: (name) => {
      const existing = db.prepare("SELECT id FROM tags WHERE name = ?").get(name);
      if (existing) return existing.id;
      const id = ulid();
      db.prepare("INSERT INTO tags (id, name) VALUES (?, ?)").run(id, name);
      return id;
    },
    attachToCall: (callId, tagId) => {
      db.prepare("INSERT OR IGNORE INTO call_tags (call_id, tag_id) VALUES (?, ?)").run(callId, tagId);
    },
    listByCallId: (callId) =>
      db
        .prepare(
          `SELECT tags.* FROM tags
           INNER JOIN call_tags ON call_tags.tag_id = tags.id
           WHERE call_tags.call_id = ?`
        )
        .all(callId),
  };

  const contacts = {
    create: (input) => {
      const id = ulid();
      const now = toIso();
      db.prepare(
        `INSERT INTO contacts
         (id, name, phone_number, address, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        input.name,
        input.phoneNumber,
        input.address ?? null,
        input.description ?? null,
        now,
        now
      );
      return id;
    },
    update: (input) => {
      const fields = [];
      const params = [];
      if (input.name != null) {
        fields.push("name = ?");
        params.push(input.name);
      }
      if (input.phoneNumber != null) {
        fields.push("phone_number = ?");
        params.push(input.phoneNumber);
      }
      if (input.address != null) {
        fields.push("address = ?");
        params.push(input.address);
      }
      if (input.description != null) {
        fields.push("description = ?");
        params.push(input.description);
      }
      if (!fields.length) return;
      fields.push("updated_at = ?");
      params.push(toIso());
      params.push(input.id);
      db.prepare(`UPDATE contacts SET ${fields.join(", ")} WHERE id = ?`).run(...params);
    },
    list: (filters = {}) => {
      const clauses = [];
      const params = [];
      if (filters.phoneNumber) {
        clauses.push("phone_number = ?");
        params.push(filters.phoneNumber);
      }
      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      return db.prepare(`SELECT * FROM contacts ${where} ORDER BY created_at DESC`).all(...params);
    },
    findByPhone: (phoneNumber) =>
      db.prepare("SELECT * FROM contacts WHERE phone_number = ?").get(phoneNumber),
    delete: (id) =>
      db.transaction(() => {
        db.prepare("DELETE FROM call_schedules WHERE contact_id = ?").run(id);
        db.prepare("DELETE FROM contacts WHERE id = ?").run(id);
      })(),
  };

  const callSchedules = {
    create: (input) => {
      const id = ulid();
      const now = toIso();
      db.prepare(
        `INSERT INTO call_schedules
         (id, contact_id, status, start_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(id, input.contactId, input.status, input.startAt, now, now);
      return id;
    },
    update: (input) => {
      const fields = [];
      const params = [];
      if (input.status != null) {
        fields.push("status = ?");
        params.push(input.status);
      }
      if (input.startAt != null) {
        fields.push("start_at = ?");
        params.push(input.startAt);
      }
      if (!fields.length) return;
      fields.push("updated_at = ?");
      params.push(toIso());
      params.push(input.id);
      db.prepare(`UPDATE call_schedules SET ${fields.join(", ")} WHERE id = ?`).run(...params);
    },
    listByFilters: (filters = {}) => {
      const clauses = [];
      const params = [];
      if (filters.status) {
        clauses.push("call_schedules.status = ?");
        params.push(filters.status);
      }
      if (filters.startFrom) {
        clauses.push("call_schedules.start_at >= ?");
        params.push(filters.startFrom);
      }
      if (filters.startTo) {
        clauses.push("call_schedules.start_at <= ?");
        params.push(filters.startTo);
      }
      if (filters.phoneNumber) {
        clauses.push("contacts.phone_number = ?");
        params.push(filters.phoneNumber);
      }
      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      return db
        .prepare(
          `SELECT call_schedules.*, contacts.name AS contact_name, contacts.phone_number AS contact_phone
           FROM call_schedules
           INNER JOIN contacts ON contacts.id = call_schedules.contact_id
           ${where}
           ORDER BY call_schedules.start_at DESC`
        )
        .all(...params);
    },
    delete: (id) => db.prepare("DELETE FROM call_schedules WHERE id = ?").run(id),
  };

  const operators = {
    create: (input) => {
      const id = ulid();
      db.prepare(
        `INSERT INTO operators
         (id, name, email, password_hash, role, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(id, input.name, input.email, input.passwordHash, input.role ?? null, toIso());
      return id;
    },
    findByEmail: (email) => db.prepare("SELECT * FROM operators WHERE email = ?").get(email),
    findById: (id) => db.prepare("SELECT * FROM operators WHERE id = ?").get(id),
  };

  const authSessions = {
    create: (input) => {
      const id = ulid();
      db.prepare(
        `INSERT INTO auth_sessions
         (id, operator_id, refresh_token_hash, expires_at, created_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        input.operatorId,
        input.refreshTokenHash,
        input.expiresAt,
        toIso(),
        null
      );
      return id;
    },
    findByTokenHash: (tokenHash) =>
      db.prepare(
        `SELECT * FROM auth_sessions
         WHERE refresh_token_hash = ? AND revoked_at IS NULL`
      ).get(tokenHash),
    revoke: (id) =>
      db.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE id = ?").run(toIso(), id),
  };

  return {
    calls,
    utterances,
    riceInquiries,
    transcripts,
    notes,
    tags,
    contacts,
    callSchedules,
    operators,
    authSessions,
  };
};
