-- Incentive calculation sheets — save/load monthly ERP incentive runs
CREATE TABLE IF NOT EXISTS incentive_sheets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period        TEXT NOT NULL,           -- e.g. "May 2026"
  raw_data      TEXT NOT NULL,           -- pasted ERP export text
  overrides     JSONB    DEFAULT '{}',   -- per-row overrides (balance, minWastage, split)
  default_split INTEGER  DEFAULT 70,
  mapper_entries JSONB   DEFAULT NULL,   -- null = use app defaults
  master_entries JSONB   DEFAULT NULL,   -- null = use app defaults
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE incentive_sheets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'incentive_sheets' AND policyname = 'incentive_sheets_all'
  ) THEN
    CREATE POLICY incentive_sheets_all ON incentive_sheets FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
