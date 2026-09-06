-- 167: Credit security forms (கடன் / பாதுகாப்பு உறுதிமொழிப் படிவம்)
-- Standalone form with 2 photos, full KYC + SURETY fields.

create table pledge_forms (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),

  -- Header
  bill_order_no    text,
  form_date        date not null default current_date,
  form_time        text,
  photo_date       date,

  -- Photos (base64 data URIs)
  photo1_data      text,   -- customer face photo
  photo2_data      text,   -- jewellery / item photo

  -- Top customer block
  customer_name    text not null,
  customer_phone   text,
  loan_amount      numeric(14,2),
  rate_fixed       boolean,           -- true = rate fixed, false = not fixed
  agreed_rate      text,
  agreed_rate_date date,
  due_date         date,

  -- KYC details
  kyc_full_name    text,
  kyc_aadhaar_name text,
  kyc_aadhaar_no   text,
  kyc_pan_no       text,
  kyc_phone        text,
  kyc_alt_phone    text,
  kyc_address      text,
  authorizer_name  text,
  doc_aadhaar      boolean not null default false,
  doc_pan          boolean not null default false,
  doc_address      boolean not null default false,
  doc_others       text,

  -- SURETY
  surety_full_name    text,
  surety_aadhaar_name text,
  surety_phone        text,
  surety_alt_phone    text,
  surety_aadhaar_no   text,
  surety_pan          text,
  surety_address      text,

  -- Meta
  recorded_by      uuid references auth.users(id),
  recorded_by_name text
);

alter table pledge_forms enable row level security;
create policy "auth_all" on pledge_forms for all to authenticated using (true) with check (true);
