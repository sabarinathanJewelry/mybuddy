CREATE TABLE IF NOT EXISTS payroll_sheets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period     TEXT NOT NULL,
  entries    JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE payroll_sheets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'payroll_sheets' AND policyname = 'payroll_sheets_all'
  ) THEN
    CREATE POLICY payroll_sheets_all ON payroll_sheets FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
