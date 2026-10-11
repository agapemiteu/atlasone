-- Claim links carry the action the developer confirms in the browser (D13, D16):
-- 'new_key' mints a key, 'rotate_key' revokes active keys and mints one, 'revoke_key' revokes.
ALTER TABLE claims ADD COLUMN action TEXT NOT NULL DEFAULT 'new_key'
  CHECK (action IN ('new_key', 'rotate_key', 'revoke_key'));
