-- 172: YouTube comment auto-replies (polled — YouTube has no comment webhooks)

-- Single row; holds the channel OAuth refresh token, so no client policies (service role only)
CREATE TABLE IF NOT EXISTS yt_settings (
  id             INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  refresh_token  TEXT,
  channel_id     TEXT,
  channel_title  TEXT,
  connected_at   TIMESTAMPTZ,
  last_polled_at TIMESTAMPTZ,
  last_error     TEXT
);
ALTER TABLE yt_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS yt_reply_rules (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  keywords      TEXT NOT NULL,
  reply_text    TEXT NOT NULL,
  sort_order    INT NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT true,
  trigger_count INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE yt_reply_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all" ON yt_reply_rules
  FOR ALL TO authenticated
  USING  (coalesce(auth.jwt()->'app_metadata'->>'role', 'admin') != 'staff')
  WITH CHECK (coalesce(auth.jwt()->'app_metadata'->>'role', 'admin') != 'staff');

CREATE TABLE IF NOT EXISTS yt_reply_log (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id   TEXT NOT NULL UNIQUE,
  video_id     TEXT,
  rule_id      UUID REFERENCES yt_reply_rules(id) ON DELETE SET NULL,
  author       TEXT,
  comment_text TEXT,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'replied', 'failed', 'no_match')),
  error        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS yt_reply_log_created_idx ON yt_reply_log (created_at DESC);
ALTER TABLE yt_reply_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_read" ON yt_reply_log
  FOR SELECT TO authenticated
  USING (coalesce(auth.jwt()->'app_metadata'->>'role', 'admin') != 'staff');

-- Starter rules (first match by sort_order wins) — edit the text in MyBuddy → Social
INSERT INTO yt_reply_rules (keywords, reply_text, sort_order)
SELECT * FROM (VALUES
  ('916, hallmark, hall mark, kdm, bis, purity, original gold, real gold',
   'Hi {name}! Yes, our gold jewellery is 916 BIS hallmarked ✅ For price and details, please WhatsApp us at +91 73053 93916. Sabarinathan Jewellers, 166 Nethaji Road, Madurai.',
   1),
  ('price, rate, cost, how much, evlo, evvalavu, enna vilai, vilai, விலை, எவ்வளவு, ரேட், details, weight, gram, available, stock',
   'Hi {name}! 🙏 For price and details, please WhatsApp us at +91 73053 93916. Sabarinathan Jewellers, 166 Nethaji Road, Madurai.',
   2)
) AS v(keywords, reply_text, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM yt_reply_rules);
