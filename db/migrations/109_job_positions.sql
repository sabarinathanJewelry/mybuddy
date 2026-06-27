-- Job positions — admin manages these; each gets its own apply link
create table if not exists job_positions (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null,
  slug        text not null unique,
  description text,
  is_active   boolean not null default true
);

-- RLS: public read (to show open positions), authenticated write
alter table job_positions enable row level security;

create policy "public_read_positions" on job_positions
  for select using (true);

create policy "auth_manage_positions" on job_positions
  for all using (auth.role() = 'authenticated');

-- Add position tracking to existing applications
alter table job_applications
  add column if not exists position_name text,
  add column if not exists position_slug text;

-- Seed the original Sales Executive position
insert into job_positions (name, slug, description)
values ('Sales Executive', 'sales-executive', 'Customer-facing jewellery sales role');
