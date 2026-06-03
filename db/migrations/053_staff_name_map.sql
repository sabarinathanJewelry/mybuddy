-- Maps incentive sheet names → payroll staff names (persistent, global)
CREATE TABLE IF NOT EXISTS staff_name_map (
  incentive_name TEXT PRIMARY KEY,
  staff_name     TEXT NOT NULL
);

ALTER TABLE staff_name_map ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'staff_name_map' AND policyname = 'staff_name_map_all'
  ) THEN
    CREATE POLICY staff_name_map_all ON staff_name_map FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
