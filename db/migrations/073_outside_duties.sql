-- 073: Outside Duties — pre-arrival shop-related work assignments
-- Staff can apply or admin can directly assign; approved duties excuse lateness
CREATE TABLE IF NOT EXISTS outside_duties (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  bio_user_id      TEXT        NOT NULL,
  duty_date        DATE        NOT NULL,
  description      TEXT        NOT NULL,
  expected_arrival TIME,
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','approved','rejected')),
  initiated_by     TEXT        NOT NULL DEFAULT 'staff'
                               CHECK (initiated_by IN ('admin','staff')),
  admin_note       TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE outside_duties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all" ON outside_duties
  FOR ALL TO authenticated
  USING  ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "staff_own_select" ON outside_duties
  FOR SELECT TO authenticated
  USING (bio_user_id = (
    SELECT bio_user_id FROM staff WHERE user_id = auth.uid() LIMIT 1
  ));

CREATE POLICY "staff_own_insert" ON outside_duties
  FOR INSERT TO authenticated
  WITH CHECK (bio_user_id = (
    SELECT bio_user_id FROM staff WHERE user_id = auth.uid() LIMIT 1
  ));
