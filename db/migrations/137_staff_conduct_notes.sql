-- 137: Staff conduct/dress-code notes. Designated reviewers (admin/subadmin, or
-- any staff with the new conduct_note_access flag — same pattern as
-- repair_access/incentive_access/kolusu_access) log notes about other staff.
-- Admin reviews each note and decides whether to apply a fine — logging a note
-- never auto-deducts pay, matching this app's existing late-fine-waiver trust
-- model where a human always makes the final call.

alter table profiles add column if not exists conduct_note_access boolean not null default false;

create table conduct_categories (
  id serial primary key,
  name text not null unique
);

insert into conduct_categories (name) values
  ('Dress Code'), ('Grooming'), ('Customer Handling'), ('Punctuality'), ('Other')
on conflict (name) do nothing;

create table conduct_notes (
  id             uuid primary key default gen_random_uuid(),
  staff_id       uuid not null references staff(id) on delete cascade,
  staff_name     text,
  category_id    integer references conduct_categories(id) on delete set null,
  note           text,
  note_date      date not null default current_date,
  noted_by       uuid references auth.users(id),
  noted_by_name  text,
  status         text not null default 'pending' check (status in ('pending', 'fined', 'dismissed')),
  fine_amount    numeric(10,2),
  resolved_by    uuid references auth.users(id),
  resolved_by_name text,
  resolved_at    timestamptz,
  created_at     timestamptz not null default now()
);
create index idx_conduct_notes_staff on conduct_notes(staff_id, note_date desc);

alter table conduct_categories enable row level security;
alter table conduct_notes enable row level security;

-- Same permissive "auth_all" trust model as repair_access/incentive_access/
-- kolusu_access — those are UI-level gates (sidebar nav hiding), not RLS-level,
-- so this matches existing convention rather than introducing a new, easy-to-
-- get-subtly-wrong RLS pattern for a single feature.
create policy "auth_all" on conduct_categories for all to authenticated using (true) with check (true);
create policy "auth_all" on conduct_notes for all to authenticated using (true) with check (true);
