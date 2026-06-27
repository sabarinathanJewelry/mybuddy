-- Job applications table for public recruitment form
create table if not exists job_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- Personal
  full_name        text not null,
  age              int,
  mobile           text not null,
  address          text,

  -- Employment
  current_company        text,
  jewellery_experience   text,
  current_designation    text,
  current_salary         text,
  incentive              text,
  notice_period          text,
  reason_leaving         text,

  -- Jewellery Knowledge
  sections_worked        text[],
  daily_responsibilities text,
  biggest_achievement    text,
  skills_to_improve      text,

  -- Customer Handling
  handle_making_charges  text,
  handle_angry_customer  text,
  old_gold_experience    text,

  -- Salary & Career
  expected_salary        text,
  salary_justification   text,
  stay_if_raised         text,
  stay_explanation       text,
  career_vision          text,

  -- Integrity
  disciplinary_action    boolean,
  willing_extended_hours boolean,
  additional_info        text,

  -- Admin fields
  status      text not null default 'new',
  admin_notes text
);

alter table job_applications enable row level security;

-- Anyone can apply (public form)
create policy "public_apply" on job_applications
  for insert with check (true);

-- Only authenticated users can read/update
create policy "auth_view" on job_applications
  for select using (auth.role() = 'authenticated');

create policy "auth_update" on job_applications
  for update using (auth.role() = 'authenticated');
