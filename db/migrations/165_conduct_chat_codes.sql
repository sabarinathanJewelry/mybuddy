-- 165: Admin-configurable conduct shorthand codes for staff chat.
-- Admin types "CD <name> <code>" in chat; code list is managed here.
-- points: negative = deduction applied to monthly rewards via conduct_note status.

create table conduct_chat_codes (
  id            serial primary key,
  code          text not null unique,
  label         text not null,
  category_name text not null default 'Other',
  points        integer not null default -2,
  active        boolean not null default true,
  display_order integer not null default 99
);

insert into conduct_chat_codes (code, label, category_name, points, display_order) values
  ('SH', 'Shouting',              'Other',             -2, 1),
  ('SC', 'Shouting at customer',  'Customer Handling', -5, 2),
  ('BW', 'Bad words/language',    'Other',             -2, 3),
  ('BT', 'Beating/altercation',   'Other',             -5, 4),
  ('LC', 'Laughing at customer',  'Customer Handling', -2, 5)
on conflict (code) do nothing;

alter table conduct_chat_codes enable row level security;
create policy "auth_all" on conduct_chat_codes for all to authenticated using (true) with check (true);
