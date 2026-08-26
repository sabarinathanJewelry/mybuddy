-- Counter cleanliness tracking
create table if not exists counters (
  id serial primary key,
  name text not null,
  display_order int not null default 0
);

insert into counters (name, display_order) values
  ('Counter 1', 1),
  ('Counter 2', 2),
  ('Counter 3', 3),
  ('Counter 4', 4)
on conflict do nothing;

-- Monthly: which staff is assigned to which counter
create table if not exists counter_assignments (
  id uuid primary key default gen_random_uuid(),
  counter_id int references counters(id) on delete cascade,
  bio_user_id text not null,
  month text not null, -- YYYY-MM
  created_at timestamptz default now(),
  unique(counter_id, month)
);

-- Monthly: who is the supervisor (submits hourly checks)
create table if not exists counter_supervisors (
  id uuid primary key default gen_random_uuid(),
  bio_user_id text not null,
  month text not null,
  created_at timestamptz default now(),
  unique(month)
);

-- Each hourly cleanliness check result per counter
create table if not exists cleanliness_checks (
  id uuid primary key default gen_random_uuid(),
  counter_id int references counters(id) on delete cascade,
  check_date date not null,
  check_slot text not null, -- "09:30", "10:30" ... "21:30"
  is_neat boolean not null,
  notes text,
  checked_by text not null, -- bio_user_id of supervisor
  created_at timestamptz default now(),
  unique(counter_id, check_date, check_slot)
);

-- RLS
alter table counters enable row level security;
create policy "counters_read" on counters for select using (auth.role() = 'authenticated');

alter table counter_assignments enable row level security;
create policy "counter_assignments_all" on counter_assignments for all using (auth.role() = 'authenticated');

alter table counter_supervisors enable row level security;
create policy "counter_supervisors_all" on counter_supervisors for all using (auth.role() = 'authenticated');

alter table cleanliness_checks enable row level security;
create policy "cleanliness_checks_all" on cleanliness_checks for all using (auth.role() = 'authenticated');

-- Optional: pg_cron job for hourly push notifications to supervisor
-- Run this separately after enabling pg_cron extension:
--
-- select cron.schedule(
--   'counter-cleanliness-notify',
--   '30 9-21 * * 1-6',   -- every hour at :30 from 9:30 to 21:30, Mon–Sat
--   $$
--   select net.http_post(
--     url := current_setting('app.supabase_url') || '/functions/v1/counter-notify',
--     headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key')),
--     body := '{}'::jsonb
--   );
--   $$
-- );
