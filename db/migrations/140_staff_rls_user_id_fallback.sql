-- 140: Allow staff access via staff.user_id column in addition to JWT bio_user_id.
-- This makes attendance work even when the JWT app_metadata is stale or missing
-- bio_user_id — the user_id FK column is the authoritative link.

DROP POLICY IF EXISTS "staff_select" ON staff;
CREATE POLICY "staff_select" ON staff FOR SELECT TO authenticated USING (
  coalesce(auth.jwt()->'app_metadata'->>'role', 'admin') != 'staff'
  OR bio_user_id = coalesce(auth.jwt()->'app_metadata'->>'bio_user_id', '')
  OR user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND conduct_note_access = true)
);

DROP POLICY IF EXISTS "logs_select" ON attendance_logs;
CREATE POLICY "logs_select" ON attendance_logs FOR SELECT TO authenticated USING (
  coalesce(auth.jwt()->'app_metadata'->>'role', 'admin') != 'staff'
  OR bio_user_id = coalesce(auth.jwt()->'app_metadata'->>'bio_user_id', '')
  OR bio_user_id IN (SELECT bio_user_id FROM staff WHERE user_id = auth.uid())
);
