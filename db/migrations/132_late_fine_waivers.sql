-- Per-day late fine waivers: admin can void a specific day's late fine.
-- Kept as an audit trail visible both in the admin Monthly attendance view
-- and to the affected staff member (their own late-fine history).
create table late_fine_waivers (
  id             uuid primary key default gen_random_uuid(),
  bio_user_id    text not null,
  staff_name     text,
  fine_date      date not null,
  late_minutes   integer not null default 0,
  waived_amount  numeric not null default 0,
  fine_mode      text,             -- "day" or "minute", for context
  reason         text,
  waived_by      uuid references auth.users(id),
  waived_by_name text,
  created_at     timestamptz not null default now(),
  unique (bio_user_id, fine_date)
);

create index on late_fine_waivers (bio_user_id, fine_date desc);

-- RLS: admin/subadmin can manage all; a staff member can read only their own waivers
alter table late_fine_waivers enable row level security;

create policy "admin manage fine waivers"
  on late_fine_waivers for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'subadmin')
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'subadmin')
    )
  );

create policy "staff read own fine waivers"
  on late_fine_waivers for select
  using (
    exists (
      select 1 from staff
      where staff.bio_user_id = late_fine_waivers.bio_user_id
        and staff.user_id = auth.uid()
    )
  );
