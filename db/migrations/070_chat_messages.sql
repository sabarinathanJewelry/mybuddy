CREATE TABLE IF NOT EXISTS chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   UUID NOT NULL REFERENCES auth.users(id),
  sender_name TEXT NOT NULL,
  message     TEXT NOT NULL,
  is_deleted  BOOLEAN NOT NULL DEFAULT false,
  edited_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_chat"
  ON chat_messages FOR SELECT TO authenticated USING (true);

CREATE POLICY "insert_own_chat"
  ON chat_messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY "update_chat"
  ON chat_messages FOR UPDATE TO authenticated
  USING (
    sender_id = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "delete_chat"
  ON chat_messages FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Enable realtime for instant delivery
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
