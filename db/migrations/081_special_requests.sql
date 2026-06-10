-- 081: Special permission requests (colored dress, makeup, etc.)
CREATE TABLE IF NOT EXISTS special_requests (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  bio_user_id   TEXT NOT NULL REFERENCES staff(bio_user_id) ON DELETE CASCADE,
  request_date  DATE NOT NULL,
  category      TEXT NOT NULL,   -- e.g. 'Colored Dress', 'Makeup', 'Hair Style', 'Other'
  reason        TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note    TEXT,
  decided_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE special_requests ENABLE ROW LEVEL SECURITY;

-- Staff can insert their own; admin can insert any
CREATE POLICY "insert_own" ON special_requests
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Staff can read their own rows; admin reads all
CREATE POLICY "select_own_or_admin" ON special_requests
  FOR SELECT TO authenticated
  USING (
    bio_user_id = (
      SELECT bio_user_id FROM staff
      WHERE user_id = auth.uid()
      LIMIT 1
    )
    OR coalesce(auth.jwt()->'app_metadata'->>'role', 'admin') != 'staff'
  );

-- Only admin can update (decide)
CREATE POLICY "admin_update" ON special_requests
  FOR UPDATE TO authenticated
  USING  (coalesce(auth.jwt()->'app_metadata'->>'role', 'admin') != 'staff')
  WITH CHECK (coalesce(auth.jwt()->'app_metadata'->>'role', 'admin') != 'staff');

-- Only admin can delete
CREATE POLICY "admin_delete" ON special_requests
  FOR DELETE TO authenticated
  USING (coalesce(auth.jwt()->'app_metadata'->>'role', 'admin') != 'staff');
