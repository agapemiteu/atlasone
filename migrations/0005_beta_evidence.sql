-- Beta evidence (PRD Test 3 and Test 6): who connected with which agent, every tool call and its outcome,
-- and each tester's questionnaire. Metadata only: never prompts, completions, code or keys.

CREATE TABLE activity (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  at         INTEGER NOT NULL,
  github_id  TEXT NOT NULL,
  login      TEXT,
  kind       TEXT NOT NULL CHECK (kind IN ('connected', 'tool')),
  client     TEXT,              -- MCP client name shown on the consent page, e.g. "Claude Code"
  tool       TEXT,
  action     TEXT,
  project    TEXT,              -- slug or id as the agent passed it
  ok         INTEGER CHECK (ok IN (0, 1)),
  error_code TEXT,
  request_id TEXT,
  verified   INTEGER CHECK (verified IN (0, 1)),
  ms         INTEGER
);
CREATE INDEX activity_user_time ON activity (github_id, at);

CREATE TABLE feedback (
  github_id    TEXT PRIMARY KEY,
  login        TEXT NOT NULL,
  submitted_at INTEGER NOT NULL,
  agent        TEXT NOT NULL,
  stack        TEXT NOT NULL,
  minutes      INTEGER CHECK (minutes BETWEEN 0 AND 1440),
  manual_steps TEXT NOT NULL,
  issues       TEXT NOT NULL,
  rating       INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  anonymous    INTEGER NOT NULL CHECK (anonymous IN (0, 1))
);
