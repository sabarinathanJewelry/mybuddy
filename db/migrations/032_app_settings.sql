-- Generic key-value store for app-level settings (e.g., kiosk unlock sequence)
CREATE TABLE IF NOT EXISTS app_settings (
  key   text PRIMARY KEY,
  value jsonb NOT NULL
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read settings
CREATE POLICY "settings_select" ON app_settings FOR SELECT TO authenticated USING (true);

-- Only admins can write settings
CREATE POLICY "settings_insert" ON app_settings FOR INSERT TO authenticated WITH CHECK (
  coalesce(auth.jwt()->'app_metadata'->>'role', 'admin') != 'staff'
);
CREATE POLICY "settings_update" ON app_settings FOR UPDATE TO authenticated USING (
  coalesce(auth.jwt()->'app_metadata'->>'role', 'admin') != 'staff'
);
CREATE POLICY "settings_delete" ON app_settings FOR DELETE TO authenticated USING (
  coalesce(auth.jwt()->'app_metadata'->>'role', 'admin') != 'staff'
);

-- Seed empty kiosk sequence so the SELECT .single() doesn't 404 before setup
INSERT INTO app_settings (key, value)
VALUES ('kiosk_sequence', '[]'::jsonb)
ON CONFLICT (key) DO NOTHING;
