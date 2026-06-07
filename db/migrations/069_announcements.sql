CREATE TABLE IF NOT EXISTS announcements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  body        TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  expires_at  DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read active announcements
CREATE POLICY "read_active_announcements"
  ON announcements FOR SELECT
  TO authenticated
  USING (is_active = true AND (expires_at IS NULL OR expires_at >= CURRENT_DATE));

-- Only admins can manage announcements (via service role / admin API calls)
CREATE POLICY "admin_all_announcements"
  ON announcements FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
