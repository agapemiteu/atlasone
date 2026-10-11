-- Kaggle secrets are not available to runs started through the API, so each wake carries a single-use,
-- short-lived bootstrap token instead of long-lived keys. Only its SHA-256 digest is stored.
ALTER TABLE backend_wakes ADD COLUMN bootstrap_hash TEXT;
ALTER TABLE backend_wakes ADD COLUMN bootstrap_used_at INTEGER;
