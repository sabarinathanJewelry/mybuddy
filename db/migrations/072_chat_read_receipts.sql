-- 072: Chat read receipts — tracks last-read timestamp per user
-- Unread badge = messages after last_read_at not sent by that user
CREATE TABLE IF NOT EXISTS chat_read_receipts (
  user_id      UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01T00:00:00Z'
);

ALTER TABLE chat_read_receipts ENABLE ROW LEVEL SECURITY;

-- Each user can only read/write their own row
CREATE POLICY "own_receipt" ON chat_read_receipts
  FOR ALL TO authenticated
  USING (user_id = auth.uid());
