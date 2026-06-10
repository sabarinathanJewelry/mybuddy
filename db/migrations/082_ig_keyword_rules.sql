-- 082: Instagram keyword auto-DM rules
CREATE TABLE IF NOT EXISTS ig_keyword_rules (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword      TEXT NOT NULL,           -- e.g. "PRICE", "OFFER"
  reply_text   TEXT NOT NULL,           -- DM message to send
  active       BOOLEAN NOT NULL DEFAULT true,
  match_type   TEXT NOT NULL DEFAULT 'contains' CHECK (match_type IN ('contains', 'exact')),
  trigger_count INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE ig_keyword_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all" ON ig_keyword_rules
  FOR ALL TO authenticated
  USING  (coalesce(auth.jwt()->'app_metadata'->>'role', 'admin') != 'staff')
  WITH CHECK (coalesce(auth.jwt()->'app_metadata'->>'role', 'admin') != 'staff');
