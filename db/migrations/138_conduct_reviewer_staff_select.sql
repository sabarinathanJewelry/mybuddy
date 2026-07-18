-- 138: Conduct-note reviewers need to see all staff, not just their own row, to
-- log notes about colleagues. The staff_select policy from migration 030
-- restricts any role='staff' login to bio_user_id = themselves (staff table also
-- holds salary data). Add a narrow exception for profiles.conduct_note_access.

DROP POLICY IF EXISTS "staff_select" ON staff;
CREATE POLICY "staff_select" ON staff FOR SELECT TO authenticated USING (
  coalesce(auth.jwt()->'app_metadata'->>'role', 'admin') != 'staff'
  OR bio_user_id = coalesce(auth.jwt()->'app_metadata'->>'bio_user_id', '')
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND conduct_note_access = true)
);
