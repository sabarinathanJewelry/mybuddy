-- Migration 110: KPI monthly targets per staff (admin-set)
create table if not exists kpi_targets (
  id           uuid primary key default gen_random_uuid(),
  staff_id     uuid not null references staff(id) on delete cascade,
  month        text not null,                     -- YYYY-MM
  sales_target numeric(15,2) not null default 0,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  unique(staff_id, month)
);

alter table kpi_targets enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'kpi_targets' and policyname = 'auth_all'
  ) then
    create policy "auth_all" on kpi_targets for all to authenticated using (true) with check (true);
  end if;
end $$;
