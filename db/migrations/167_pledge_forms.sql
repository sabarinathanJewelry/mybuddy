-- 167: Customer loan pledge forms with photo capture.
-- Staff fills form and captures 2 photos; stored standalone (not linked to loans table).

create table pledge_forms (
  id              uuid primary key default gen_random_uuid(),
  form_date       date not null default current_date,

  -- Customer
  customer_name   text not null,
  father_husband  text,
  address         text,
  phone           text,
  aadhaar         text,
  pan             text,
  occupation      text,

  -- Pledged item
  item_description text,
  gross_weight_g  numeric(10,3),
  purity          text,
  loan_amount     numeric(14,2),
  interest_rate   numeric(6,2),

  -- Guarantor (SRETY)
  srety_name      text,
  srety_address   text,
  srety_phone     text,
  srety_aadhaar   text,
  srety_relation  text,

  -- Photos (base64 data URIs)
  photo1_data     text,   -- customer face photo
  photo2_data     text,   -- ID / item photo

  -- Meta
  recorded_by     uuid references auth.users(id),
  recorded_by_name text,
  notes           text,
  created_at      timestamptz not null default now()
);

alter table pledge_forms enable row level security;
create policy "auth_all" on pledge_forms for all to authenticated using (true) with check (true);
