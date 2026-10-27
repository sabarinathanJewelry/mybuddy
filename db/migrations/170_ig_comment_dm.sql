-- 170: Instagram comment → private DM upgrades
ALTER TABLE ig_keyword_rules
  ADD COLUMN IF NOT EXISTS media_id     TEXT,
  ADD COLUMN IF NOT EXISTS media_label  TEXT,
  ADD COLUMN IF NOT EXISTS public_reply TEXT;

CREATE TABLE IF NOT EXISTS ig_dm_log (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id    TEXT NOT NULL UNIQUE,
  media_id      TEXT,
  rule_id       UUID REFERENCES ig_keyword_rules(id) ON DELETE SET NULL,
  from_id       TEXT,
  username      TEXT,
  comment_text  TEXT,
  dm_status     TEXT NOT NULL DEFAULT 'pending' CHECK (dm_status IN ('pending', 'sent', 'failed', 'no_match')),
  reply_status  TEXT CHECK (reply_status IN ('sent', 'failed')),
  error         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ig_dm_log_created_idx ON ig_dm_log (created_at DESC);

ALTER TABLE ig_dm_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read" ON ig_dm_log
  FOR SELECT TO authenticated
  USING (coalesce(auth.jwt()->'app_metadata'->>'role', 'admin') != 'staff');
