-- SQLite schema (MVP)
-- IDs are ULID strings, timestamps are UTC ISO-8601 text.

CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_sec INTEGER,
  from_number TEXT,
  to_number TEXT,
  call_type TEXT,
  status TEXT,
  provider TEXT,
  provider_call_sid TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  address TEXT,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contacts_phone_number ON contacts(phone_number);

CREATE INDEX IF NOT EXISTS idx_calls_customer_id ON calls(customer_id);
CREATE INDEX IF NOT EXISTS idx_calls_started_at ON calls(started_at);
CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
CREATE INDEX IF NOT EXISTS idx_calls_provider_sid ON calls(provider_call_sid);

CREATE TABLE IF NOT EXISTS utterances (
  id TEXT PRIMARY KEY,
  call_id TEXT NOT NULL,
  speaker TEXT NOT NULL,
  text TEXT NOT NULL,
  translation TEXT,
  started_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (call_id) REFERENCES calls(id)
);

CREATE INDEX IF NOT EXISTS idx_utterances_call_id ON utterances(call_id);
CREATE INDEX IF NOT EXISTS idx_utterances_created_at ON utterances(created_at);

CREATE TABLE IF NOT EXISTS rice_inquiries (
  id TEXT PRIMARY KEY,
  call_id TEXT NOT NULL UNIQUE,
  brand TEXT,
  weight_kg REAL,
  delivery_address TEXT,
  delivery_date TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (call_id) REFERENCES calls(id)
);

CREATE INDEX IF NOT EXISTS idx_rice_inquiries_call_id ON rice_inquiries(call_id);

CREATE TABLE IF NOT EXISTS transcripts (
  id TEXT PRIMARY KEY,
  call_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  text TEXT NOT NULL,
  language TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (call_id) REFERENCES calls(id)
);

CREATE INDEX IF NOT EXISTS idx_transcripts_call_id ON transcripts(call_id);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  call_id TEXT NOT NULL,
  author_id TEXT,
  score INTEGER,
  category TEXT,
  memo TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (call_id) REFERENCES calls(id)
);

CREATE INDEX IF NOT EXISTS idx_notes_call_id ON notes(call_id);
CREATE INDEX IF NOT EXISTS idx_notes_author_id ON notes(author_id);
CREATE INDEX IF NOT EXISTS idx_notes_score ON notes(score);
CREATE INDEX IF NOT EXISTS idx_notes_category ON notes(category);

CREATE TABLE IF NOT EXISTS call_schedules (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  status TEXT NOT NULL,
  start_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (contact_id) REFERENCES contacts(id)
);

CREATE INDEX IF NOT EXISTS idx_call_schedules_contact_id ON call_schedules(contact_id);
CREATE INDEX IF NOT EXISTS idx_call_schedules_status ON call_schedules(status);
CREATE INDEX IF NOT EXISTS idx_call_schedules_start_at ON call_schedules(start_at);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS call_tags (
  call_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (call_id, tag_id),
  FOREIGN KEY (call_id) REFERENCES calls(id),
  FOREIGN KEY (tag_id) REFERENCES tags(id)
);

CREATE INDEX IF NOT EXISTS idx_call_tags_call_id ON call_tags(call_id);
CREATE INDEX IF NOT EXISTS idx_call_tags_tag_id ON call_tags(tag_id);

CREATE TABLE IF NOT EXISTS operators (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL,
  refresh_token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (operator_id) REFERENCES operators(id)
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_operator_id ON auth_sessions(operator_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_hash ON auth_sessions(refresh_token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);
