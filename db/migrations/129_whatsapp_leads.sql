-- Multi-channel lead inbox: WhatsApp, Messenger, Instagram DMs
-- One lead row per unique sender per channel; messages stored separately

CREATE TABLE IF NOT EXISTS whatsapp_leads (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_id           TEXT        NOT NULL,
  channel         TEXT        NOT NULL DEFAULT 'whatsapp'
                  CHECK (channel IN ('whatsapp', 'instagram', 'messenger')),
  display_name    TEXT,
  status          TEXT        NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new', 'hot', 'warm', 'cold', 'converted', 'lost')),
  assigned_to     UUID        REFERENCES profiles(id),
  last_message_at TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (wa_id, channel)
);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID        NOT NULL REFERENCES whatsapp_leads(id) ON DELETE CASCADE,
  wa_message_id TEXT        UNIQUE,
  direction     TEXT        NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body          TEXT        NOT NULL DEFAULT '',
  media_type    TEXT,
  media_url     TEXT,
  status        TEXT        NOT NULL DEFAULT 'received',
  sent_by       UUID        REFERENCES profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE whatsapp_leads    ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leads_admin" ON whatsapp_leads
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'subadmin')
    )
  );

CREATE POLICY "messages_admin" ON whatsapp_messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'subadmin')
    )
  );

CREATE INDEX IF NOT EXISTS idx_wleads_status   ON whatsapp_leads (status);
CREATE INDEX IF NOT EXISTS idx_wleads_last_msg ON whatsapp_leads (last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_wmsg_lead       ON whatsapp_messages (lead_id, created_at);
