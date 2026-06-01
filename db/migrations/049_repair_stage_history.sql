-- Migration 049: Repair stage history + goldsmith info

-- Track every status change: who changed it, when, and goldsmith details
CREATE TABLE IF NOT EXISTS repair_stage_history (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_id       UUID         NOT NULL REFERENCES repairs(id) ON DELETE CASCADE,
  from_status     TEXT,
  to_status       TEXT         NOT NULL,
  changed_by      TEXT,        -- display_name of admin / staff who made the change
  goldsmith_type  TEXT         CHECK (goldsmith_type IN ('internal', 'external')),
  goldsmith_name  TEXT,        -- name of external goldsmith (aasari)
  notes           TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_repair_history_repair ON repair_stage_history(repair_id);
CREATE INDEX IF NOT EXISTS idx_repair_history_created ON repair_stage_history(created_at DESC);

-- Goldsmith info stored on the repair row itself
ALTER TABLE repairs ADD COLUMN IF NOT EXISTS goldsmith_type TEXT
  CHECK (goldsmith_type IN ('internal', 'external'));
ALTER TABLE repairs ADD COLUMN IF NOT EXISTS goldsmith_name TEXT;

ALTER TABLE repair_stage_history ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'repair_stage_history' AND policyname = 'auth_all'
  ) THEN
    CREATE POLICY "auth_all" ON repair_stage_history FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
