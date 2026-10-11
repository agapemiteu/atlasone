-- Session id for the beta-evidence log (D20): one per OAuth connection ("conn_...") or personal token
-- ("pat_..."), carried by every event from that connection, so a tester's session can be traced end to end.
ALTER TABLE activity ADD COLUMN session_id TEXT;
CREATE INDEX activity_session ON activity (session_id);

-- Optional public repo of the app the tester integrated, where they commit ATLAS_VERIFICATION.jwt.
ALTER TABLE feedback ADD COLUMN repo_url TEXT;
