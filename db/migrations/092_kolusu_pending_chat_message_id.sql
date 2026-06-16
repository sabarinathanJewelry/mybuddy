-- 092: Link kolusu_pending_sales to the source chat_message
-- Allows idempotent processing: skip messages already converted to a pending sale.
ALTER TABLE kolusu_pending_sales
  ADD COLUMN IF NOT EXISTS chat_message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_kolusu_pending_chat_msg
  ON kolusu_pending_sales(chat_message_id)
  WHERE chat_message_id IS NOT NULL;
