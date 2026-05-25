-- Leave requests: staff submit, admin approves/rejects
CREATE TABLE IF NOT EXISTS leave_requests (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  bio_user_id text        NOT NULL,
  leave_date  date        NOT NULL,
  leave_type  text        NOT NULL DEFAULT 'casual',  -- casual | sick | half_day
  reason      text,
  status      text        NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  admin_note  text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- In-app notifications (broadcast = for_bio_user_id IS NULL, targeted = specific bio_user_id)
CREATE TABLE IF NOT EXISTS app_notifications (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  for_bio_user_id  text,
  title            text        NOT NULL,
  body             text        NOT NULL,
  ref_type         text,
  ref_id           uuid,
  created_at       timestamptz DEFAULT now()
);

-- Per-user read tracking (using supabase auth uid so both admin and staff can mark read)
CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id uuid NOT NULL REFERENCES app_notifications(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL,
  PRIMARY KEY (notification_id, user_id)
);

ALTER TABLE leave_requests     ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_notifications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_reads ENABLE ROW LEVEL SECURITY;

-- leave_requests: all authenticated read
CREATE POLICY "all read leave_requests" ON leave_requests
  FOR SELECT TO authenticated USING (true);

-- leave_requests: any authenticated can insert (staff submitting for themselves)
CREATE POLICY "all insert leave_requests" ON leave_requests
  FOR INSERT TO authenticated WITH CHECK (true);

-- leave_requests: only admins can update (approve / reject)
CREATE POLICY "admin update leave_requests" ON leave_requests
  FOR UPDATE TO authenticated
  USING (coalesce(auth.jwt()->'app_metadata'->>'role','admin') != 'staff');

-- notifications: all authenticated read; all can insert (staff + admin both create notifications)
CREATE POLICY "all read app_notifications" ON app_notifications
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "all insert app_notifications" ON app_notifications
  FOR INSERT TO authenticated WITH CHECK (true);

-- notification_reads: all authenticated can read and insert their own
CREATE POLICY "all read notification_reads" ON notification_reads
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "all insert notification_reads" ON notification_reads
  FOR INSERT TO authenticated WITH CHECK (true);
