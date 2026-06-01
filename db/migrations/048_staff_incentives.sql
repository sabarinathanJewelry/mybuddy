-- Migration 048: Staff incentives (manual entry, later auto-calculated from sales)

CREATE TABLE IF NOT EXISTS staff_incentives (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id    UUID         NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  month       TEXT         NOT NULL,  -- YYYY-MM
  amount      NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  notes       TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_incentives_staff  ON staff_incentives(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_incentives_month  ON staff_incentives(month);

ALTER TABLE staff_incentives ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'staff_incentives' AND policyname = 'auth_all'
  ) THEN
    CREATE POLICY "auth_all" ON staff_incentives FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
