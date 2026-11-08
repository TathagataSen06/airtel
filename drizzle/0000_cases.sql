CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  resume_hash TEXT,
  resume_expires INTEGER,
  resume_tries INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS cases_updated_at ON cases (updated_at);
