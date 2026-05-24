-- Link staff rows to Supabase auth users
ALTER TABLE staff ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS staff_user_id_idx ON staff(user_id) WHERE user_id IS NOT NULL;

-- Update RLS: staff users may only read their own row / logs
-- (app_metadata is set by service role — users cannot modify it)
DROP POLICY IF EXISTS "authenticated_all" ON staff;
DROP POLICY IF EXISTS "authenticated_all" ON attendance_logs;

-- Staff table: admins see all; staff see only their own row
CREATE POLICY "staff_select" ON staff FOR SELECT TO authenticated USING (
  coalesce(auth.jwt()->'app_metadata'->>'role', 'admin') != 'staff'
  OR bio_user_id = coalesce(auth.jwt()->'app_metadata'->>'bio_user_id', '')
);
CREATE POLICY "staff_insert" ON staff FOR INSERT TO authenticated WITH CHECK (
  coalesce(auth.jwt()->'app_metadata'->>'role', 'admin') != 'staff'
);
CREATE POLICY "staff_update" ON staff FOR UPDATE TO authenticated USING (
  coalesce(auth.jwt()->'app_metadata'->>'role', 'admin') != 'staff'
);
CREATE POLICY "staff_delete" ON staff FOR DELETE TO authenticated USING (
  coalesce(auth.jwt()->'app_metadata'->>'role', 'admin') != 'staff'
);

-- Attendance logs: admins see all; staff see only their own punches
CREATE POLICY "logs_select" ON attendance_logs FOR SELECT TO authenticated USING (
  coalesce(auth.jwt()->'app_metadata'->>'role', 'admin') != 'staff'
  OR bio_user_id = coalesce(auth.jwt()->'app_metadata'->>'bio_user_id', '')
);
CREATE POLICY "logs_insert" ON attendance_logs FOR INSERT TO authenticated WITH CHECK (
  coalesce(auth.jwt()->'app_metadata'->>'role', 'admin') != 'staff'
);
CREATE POLICY "logs_update" ON attendance_logs FOR UPDATE TO authenticated USING (
  coalesce(auth.jwt()->'app_metadata'->>'role', 'admin') != 'staff'
);
CREATE POLICY "logs_delete" ON attendance_logs FOR DELETE TO authenticated USING (
  coalesce(auth.jwt()->'app_metadata'->>'role', 'admin') != 'staff'
);
