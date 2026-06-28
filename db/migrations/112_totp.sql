-- Two-factor authentication (TOTP) secrets per user
CREATE TABLE IF NOT EXISTS user_totp (
  user_id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  totp_secret     TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_totp ENABLE ROW LEVEL SECURITY;
-- No RLS policies = only service role (server-side) can read/write this table
