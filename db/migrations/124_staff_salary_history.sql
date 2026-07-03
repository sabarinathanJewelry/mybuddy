-- Staff salary increment history
create table staff_salary_history (
  id              uuid primary key default gen_random_uuid(),
  bio_user_id     text not null,
  staff_name      text,
  old_salary      numeric not null,
  new_salary      numeric not null,
  effective_month text,          -- e.g. "June 2026"
  note            text,
  changed_at      timestamptz default now()
);

create index on staff_salary_history (bio_user_id, changed_at desc);

-- RLS: only admin/subadmin can read/write
alter table staff_salary_history enable row level security;

create policy "admin read salary history"
  on staff_salary_history for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'subadmin')
    )
  );

create policy "admin insert salary history"
  on staff_salary_history for insert
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'subadmin')
    )
  );
