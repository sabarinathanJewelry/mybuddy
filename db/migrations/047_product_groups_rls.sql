-- Migration 047: RLS policy for product_groups table
-- Needed because the table was created without a policy, blocking all writes.

ALTER TABLE product_groups ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'product_groups' AND policyname = 'auth_all'
  ) THEN
    CREATE POLICY "auth_all" ON product_groups FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
