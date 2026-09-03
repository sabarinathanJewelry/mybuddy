-- 166: Link conduct_notes to the chat message that created them.
-- Unique constraint prevents double-processing when both kiosk and admin
-- chat page try to handle the same CD message via realtime.

alter table conduct_notes add column if not exists chat_message_id uuid references chat_messages(id);
create unique index if not exists conduct_notes_chat_msg_uniq
  on conduct_notes(chat_message_id) where chat_message_id is not null;
