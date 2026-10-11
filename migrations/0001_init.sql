-- Atlas One schema (D1 / SQLite). Times are unix epoch milliseconds; ids are UUID text.
-- Secrets are never stored: keys, tokens, claims and nonces are kept only as SHA-256 hex digests.
-- No prompt or completion text is stored anywhere (PRD §8).

-- Invite-only access during NAIC (D15).
CREATE TABLE allowlist (
  github_login TEXT PRIMARY KEY COLLATE NOCASE,
  added_at     INTEGER NOT NULL
);

-- One row per developer project; binding is idempotent on (owner, slug) (P0-04).
CREATE TABLE projects (
  id              TEXT PRIMARY KEY,
  owner_github_id TEXT NOT NULL,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  UNIQUE (owner_github_id, slug)
);

-- Project keys used by finished applications against /v1 (atl_live_...).
CREATE TABLE api_keys (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id),
  prefix     TEXT NOT NULL,
  hash       TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX api_keys_project ON api_keys (project_id);

-- Personal access tokens for MCP clients without OAuth (D5) (atl_pat_...).
CREATE TABLE personal_tokens (
  id              TEXT PRIMARY KEY,
  owner_github_id TEXT NOT NULL,
  prefix          TEXT NOT NULL,
  hash            TEXT NOT NULL UNIQUE,
  created_at      INTEGER NOT NULL,
  last_used_at    INTEGER,
  revoked_at      INTEGER
);
CREATE INDEX personal_tokens_owner ON personal_tokens (owner_github_id);

-- One-time, owner-bound key claims (D2, D13). The key is minted at redemption, so plaintext never rests.
CREATE TABLE claims (
  token_hash      TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects (id),
  owner_github_id TEXT NOT NULL,
  expires_at      INTEGER NOT NULL,
  redeemed_at     INTEGER,
  key_id          TEXT REFERENCES api_keys (id)
);

-- Single-use app-verification nonces (D11).
CREATE TABLE verify_nonces (
  nonce_hash TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id),
  expires_at INTEGER NOT NULL
);

-- Atomic quota counters (D12). window_kind is 'min' or 'day'; window_start is the window's epoch ms.
CREATE TABLE rate_windows (
  project_id   TEXT NOT NULL,
  window_kind  TEXT NOT NULL CHECK (window_kind IN ('min', 'day')),
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL,
  PRIMARY KEY (project_id, window_kind, window_start)
) WITHOUT ROWID;

-- Request metadata for diagnostics (atlas_inspect). Never prompts or completions.
CREATE TABLE request_logs (
  id                TEXT PRIMARY KEY,
  request_id        TEXT NOT NULL,
  project_id        TEXT NOT NULL,
  key_id            TEXT,
  source            TEXT NOT NULL CHECK (source IN ('app', 'atlas_test')),
  verify_nonce_hash TEXT,
  status            INTEGER NOT NULL,
  error_code        TEXT,
  latency_ms        INTEGER NOT NULL,
  upstream_ms       INTEGER,
  prompt_tokens     INTEGER,
  completion_tokens INTEGER,
  created_at        INTEGER NOT NULL
);
CREATE INDEX request_logs_project_time ON request_logs (project_id, created_at DESC);
CREATE INDEX request_logs_nonce ON request_logs (verify_nonce_hash) WHERE verify_nonce_hash IS NOT NULL;

-- Registered inference backends (D3). Exactly one row is active at a time.
CREATE TABLE upstreams (
  id             TEXT PRIMARY KEY,
  url            TEXT NOT NULL,
  model_id       TEXT NOT NULL,
  model_revision TEXT NOT NULL,
  runtime        TEXT NOT NULL,
  registered_at  INTEGER NOT NULL,
  active         INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1))
);
CREATE UNIQUE INDEX upstreams_one_active ON upstreams (active) WHERE active = 1;
