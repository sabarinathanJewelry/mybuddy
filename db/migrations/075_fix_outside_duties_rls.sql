-- 075: Fix outside_duties RLS — use jwt app_metadata (same as leave_requests)
-- The original policies used profiles table which caused 400 errors

DROP POLICY IF EXISTS "admin_all"        ON outside_duties;
DROP POLICY IF EXISTS "staff_own_select" ON outside_duties;
DROP POLICY IF EXISTS "staff_own_insert" ON outside_duties;

-- Admin: full access via JWT app_metadata (same pattern as all other tables)
CREATE POLICY "admin_all" ON outside_duties
  FOR ALL TO authenticated
  USING  (coalesce(auth.jwt()->'app_metadata'->>'role','admin') != 'staff')
  WITH CHECK (coalesce(auth.jwt()->'app_metadata'->>'role','admin') != 'staff');

-- Staff: read their own rows
CREATE POLICY "staff_own_select" ON outside_duties
  FOR SELECT TO authenticated
  USING (
    bio_user_id = (SELECT bio_user_id FROM staff WHERE user_id = auth.uid() LIMIT 1)
    OR coalesce(auth.jwt()->'app_metadata'->>'role','admin') != 'staff'
  );

-- Staff: insert their own rows
CREATE POLICY "staff_own_insert" ON outside_duties
  FOR INSERT TO authenticated
  WITH CHECK (
    bio_user_id = (SELECT bio_user_id FROM staff WHERE user_id = auth.uid() LIMIT 1)
    OR coalesce(auth.jwt()->'app_metadata'->>'role','admin') != 'staff'
  );
