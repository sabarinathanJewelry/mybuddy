ALTER TABLE whatsapp_leads
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wleads_customer ON whatsapp_leads (customer_id);
