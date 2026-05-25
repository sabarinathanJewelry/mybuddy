-- Helper shift: 9:30 AM – 6:00 PM (same 9:50 AM grace as other shifts)
-- shift column already exists as text; 'helper' is a new valid value

-- Permission requests (late arrival approval, max 2/month, max 2h each)
CREATE TABLE IF NOT EXISTS permission_requests (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  bio_user_id     text NOT NULL REFERENCES staff(bio_user_id) ON DELETE CASCADE,
  permission_date date NOT NULL,
  late_minutes    int  NOT NULL CHECK (late_minutes BETWEEN 1 AND 120),
  reason          text,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_note      text,
  decided_at      timestamptz,
  notified        boolean DEFAULT false,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE permission_requests ENABLE ROW LEVEL SECURITY;

-- Staff: read & insert own requests only
CREATE POLICY "perm_select" ON permission_requests FOR SELECT TO authenticated USING (
  coalesce(auth.jwt()->'app_metadata'->>'role','admin') != 'staff'
  OR bio_user_id = coalesce(auth.jwt()->'app_metadata'->>'bio_user_id','')
);
CREATE POLICY "perm_insert" ON permission_requests FOR INSERT TO authenticated WITH CHECK (
  bio_user_id = coalesce(auth.jwt()->'app_metadata'->>'bio_user_id','')
  OR coalesce(auth.jwt()->'app_metadata'->>'role','admin') != 'staff'
);
-- Admin only: approve / reject
CREATE POLICY "perm_update" ON permission_requests FOR UPDATE TO authenticated USING (
  coalesce(auth.jwt()->'app_metadata'->>'role','admin') != 'staff'
);
CREATE POLICY "perm_delete" ON permission_requests FOR DELETE TO authenticated USING (
  coalesce(auth.jwt()->'app_metadata'->>'role','admin') != 'staff'
);
