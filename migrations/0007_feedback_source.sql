-- In-session feedback (D24): testers can answer from their agent (atlas_feedback) as well as the web form.
-- One row per tester either way (latest wins); source and session say where and when it was given.
ALTER TABLE feedback ADD COLUMN source TEXT NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'agent'));
ALTER TABLE feedback ADD COLUMN session_id TEXT;
