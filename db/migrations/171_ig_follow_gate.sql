-- 171: Instagram Auto-DM follow gate (DM the real reply only to followers)
ALTER TABLE ig_keyword_rules
  ADD COLUMN IF NOT EXISTS require_follow BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS gate_text      TEXT,
  ADD COLUMN IF NOT EXISTS follow_text    TEXT;

ALTER TABLE ig_dm_log DROP CONSTRAINT IF EXISTS ig_dm_log_dm_status_check;
ALTER TABLE ig_dm_log ADD CONSTRAINT ig_dm_log_dm_status_check
  CHECK (dm_status IN ('pending', 'gate_sent', 'awaiting_follow', 'sent', 'failed', 'no_match'));

ALTER TABLE ig_dm_log ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ig_dm_log_from_status_idx ON ig_dm_log (from_id, dm_status);
