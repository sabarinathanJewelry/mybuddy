-- ============================================================
-- MyBuddy Jewellers ERP — Supabase Schema
-- ============================================================

-- ENUMS
create type metal_kind     as enum ('gold_22k','gold_24k','gold_18k','silver','silver_pure');
create type payment_mode   as enum ('cash','upi','bank','old_gold','old_silver','advance');
create type tx_direction   as enum ('in','out');
create type sale_status    as enum ('draft','confirmed','cancelled');
create type order_status   as enum ('pending','ready','delivered','cancelled');
create type batch_status   as enum ('open','melted','refined');
create type loan_kind      as enum ('term','cc','car','local');
create type chit_kind      as enum ('golden11','bonus11','smart_gold');
create type intake_status  as enum ('pending','used','sold');
create type expense_mode   as enum ('cash','bank');
create type user_role      as enum ('admin','staff');

-- ============================================================
-- PROFILES (extends auth.users)
-- ============================================================
create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  display_name    text not null,
  role            user_role not null default 'staff',
  language        text not null default 'en',
  secret_number   text,
  login_pattern   jsonb
);

-- ============================================================
-- BOARD RATES (history-driven)
-- ============================================================
create table board_rates (
  id             bigserial primary key,
  gold_22k       numeric(12,2) not null,
  gold_24k       numeric(12,2) not null,
  gold_18k       numeric(12,2) not null,
  silver         numeric(12,2) not null,
  silver_pure    numeric(12,2) not null,
  effective_date date not null default current_date,
  created_by     uuid references profiles(id),
  created_at     timestamptz not null default now()
);

create view current_board_rate as
  select * from board_rates order by effective_date desc, created_at desc limit 1;

-- ============================================================
-- CUSTOMERS
-- ============================================================
create table customers (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  phone            text,
  address          text,
  opening_balance  numeric(14,2) not null default 0,
  gold_balance_g   numeric(14,3) not null default 0,
  silver_balance_g numeric(14,3) not null default 0,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ============================================================
-- SUPPLIERS
-- ============================================================
create table suppliers (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  phone            text,
  address          text,
  opening_balance  numeric(14,2) not null default 0,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ============================================================
-- FY SERIALS (atomic counter per financial year + series)
-- ============================================================
create table fy_serials (
  fy     text not null,
  series text not null,
  last_n integer not null default 0,
  primary key (fy, series)
);

create or replace function next_fy_serial(_fy text, _series text)
returns integer language plpgsql as $$
declare
  _n integer;
begin
  insert into fy_serials(fy, series, last_n) values (_fy, _series, 1)
  on conflict (fy, series) do update set last_n = fy_serials.last_n + 1
  returning last_n into _n;
  return _n;
end;
$$;

-- ============================================================
-- SALES
-- ============================================================
create table sales (
  id           uuid primary key default gen_random_uuid(),
  bill_no      text not null unique,
  bill_date    date not null default current_date,
  customer_id  uuid references customers(id),
  series       text not null default 'G',
  status       sale_status not null default 'confirmed',
  subtotal     numeric(14,2) not null default 0,
  gst_amount   numeric(14,2) not null default 0,
  total        numeric(14,2) not null default 0,
  notes        text,
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now()
);

create table sale_items (
  id              uuid primary key default gen_random_uuid(),
  sale_id         uuid not null references sales(id) on delete cascade,
  description     text not null,
  metal           metal_kind,
  gross_wt        numeric(10,3) not null default 0,
  stone_wt        numeric(10,3) not null default 0,
  net_wt          numeric(10,3) not null default 0,
  purity_pct      numeric(6,2) not null default 91.6,
  pure_wt         numeric(10,3) not null default 0,
  rate            numeric(12,2) not null default 0,
  va_pct          numeric(6,2) not null default 0,
  making_amt      numeric(12,2) not null default 0,
  stone_amt       numeric(12,2) not null default 0,
  diamond_amt     numeric(12,2) not null default 0,
  gst_pct         numeric(5,2) not null default 3,
  line_total      numeric(14,2) not null default 0,
  is_suspense     boolean not null default false,
  supplier_id     uuid references suppliers(id),
  sort_order      integer not null default 0
);

create table sale_payments (
  id          uuid primary key default gen_random_uuid(),
  sale_id     uuid not null references sales(id) on delete cascade,
  mode        payment_mode not null,
  amount      numeric(14,2) not null default 0,
  metal_wt    numeric(10,3),
  metal_purity numeric(6,2),
  is_advance  boolean not null default false,
  notes       text
);

-- ============================================================
-- ORDERS
-- ============================================================
create table orders (
  id           uuid primary key default gen_random_uuid(),
  order_no     text not null unique,
  order_date   date not null default current_date,
  delivery_date date,
  customer_id  uuid references customers(id),
  status       order_status not null default 'pending',
  description  text,
  estimated_wt numeric(10,3),
  advance_paid numeric(14,2) not null default 0,
  total        numeric(14,2) not null default 0,
  notes        text,
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now()
);

create table order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  description text not null,
  metal       metal_kind,
  estimated_wt numeric(10,3),
  rate        numeric(12,2),
  amount      numeric(14,2) not null default 0
);

-- ============================================================
-- PAYMENTS (standalone in/out)
-- ============================================================
create table payments (
  id           uuid primary key default gen_random_uuid(),
  pay_date     date not null default current_date,
  direction    tx_direction not null,
  mode         payment_mode not null,
  amount       numeric(14,2) not null default 0,
  customer_id  uuid references customers(id),
  supplier_id  uuid references suppliers(id),
  is_advance   boolean not null default false,
  notes        text,
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now()
);

-- ============================================================
-- SUPPLIER PURCHASES
-- ============================================================
create table supplier_purchases (
  id           uuid primary key default gen_random_uuid(),
  purchase_date date not null default current_date,
  supplier_id  uuid not null references suppliers(id),
  bill_no      text,
  metal        metal_kind,
  gross_wt     numeric(10,3),
  purity_pct   numeric(6,2),
  pure_wt      numeric(10,3),
  rate         numeric(12,2),
  amount       numeric(14,2) not null default 0,
  notes        text,
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now()
);

create table supplier_payments (
  id           uuid primary key default gen_random_uuid(),
  pay_date     date not null default current_date,
  supplier_id  uuid not null references suppliers(id),
  mode         payment_mode not null,
  amount       numeric(14,2) not null default 0,
  metal_wt     numeric(10,3),
  metal_purity numeric(6,2),
  cut_rate     numeric(12,2),
  notes        text,
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now()
);

-- View: supplier suspense items (from sales)
create view supplier_suspense as
  select
    si.id,
    si.sale_id,
    s.bill_no,
    s.bill_date,
    si.supplier_id,
    si.description,
    si.metal,
    si.pure_wt,
    si.line_total
  from sale_items si
  join sales s on s.id = si.sale_id
  where si.is_suspense = true;

-- ============================================================
-- CASH & BANK LEDGERS
-- ============================================================
create table cash_ledger (
  id           uuid primary key default gen_random_uuid(),
  tx_date      date not null default current_date,
  direction    tx_direction not null,
  amount       numeric(14,2) not null,
  description  text,
  ref_type     text,
  ref_id       uuid,
  created_at   timestamptz not null default now()
);

create table bank_ledger (
  id           uuid primary key default gen_random_uuid(),
  tx_date      date not null default current_date,
  direction    tx_direction not null,
  amount       numeric(14,2) not null,
  description  text,
  ref_type     text,
  ref_id       uuid,
  created_at   timestamptz not null default now()
);

-- ============================================================
-- OLD METAL INTAKE
-- ============================================================
create table old_metal_intake (
  id           uuid primary key default gen_random_uuid(),
  intake_date  date not null default current_date,
  metal        metal_kind not null,
  gross_wt     numeric(10,3) not null,
  purity_pct   numeric(6,2) not null default 91.6,
  pure_wt      numeric(10,3) not null,
  source_type  text,
  source_id    uuid,
  customer_id  uuid references customers(id),
  status       intake_status not null default 'pending',
  notes        text,
  created_at   timestamptz not null default now()
);

-- ============================================================
-- MELT BATCHES
-- ============================================================
create table melt_batches (
  id           uuid primary key default gen_random_uuid(),
  batch_date   date not null default current_date,
  batch_no     text not null unique,
  metal        metal_kind not null,
  input_wt     numeric(10,3) not null default 0,
  output_wt    numeric(10,3),
  loss_wt      numeric(10,3),
  status       batch_status not null default 'open',
  notes        text,
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now()
);

create table melt_batch_items (
  id           uuid primary key default gen_random_uuid(),
  batch_id     uuid not null references melt_batches(id) on delete cascade,
  intake_id    uuid references old_metal_intake(id),
  gross_wt     numeric(10,3) not null,
  purity_pct   numeric(6,2) not null,
  pure_wt      numeric(10,3) not null
);

-- ============================================================
-- LOANS
-- ============================================================
create table loans (
  id             uuid primary key default gen_random_uuid(),
  loan_date      date not null default current_date,
  kind           loan_kind not null,
  lender         text not null,
  principal      numeric(14,2) not null,
  interest_rate  numeric(6,2) not null default 0,
  tenure_months  integer,
  affects_cash   boolean not null default true,
  outstanding    numeric(14,2) not null,
  notes          text,
  created_by     uuid references profiles(id),
  created_at     timestamptz not null default now()
);

create table loan_payments (
  id           uuid primary key default gen_random_uuid(),
  loan_id      uuid not null references loans(id) on delete cascade,
  pay_date     date not null default current_date,
  principal    numeric(14,2) not null default 0,
  interest     numeric(14,2) not null default 0,
  total        numeric(14,2) not null default 0,
  mode         expense_mode not null default 'bank',
  notes        text
);

-- ============================================================
-- EXPENSES
-- ============================================================
create table expense_categories (
  id   serial primary key,
  name text not null unique
);

create table expenses (
  id           uuid primary key default gen_random_uuid(),
  exp_date     date not null default current_date,
  category_id  integer references expense_categories(id),
  description  text not null,
  amount       numeric(14,2) not null,
  mode         expense_mode not null default 'cash',
  staff_id     uuid references profiles(id),
  is_advance   boolean not null default false,
  notes        text,
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now()
);

-- ============================================================
-- SCRAP
-- ============================================================
create table scrap_entries (
  id           uuid primary key default gen_random_uuid(),
  scrap_date   date not null default current_date,
  customer_id  uuid references customers(id),
  metal        metal_kind not null,
  gross_wt     numeric(10,3) not null,
  purity_pct   numeric(6,2) not null default 91.6,
  pure_wt      numeric(10,3) not null,
  rate         numeric(12,2) not null,
  amount       numeric(14,2) not null,
  notes        text,
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now()
);

-- ============================================================
-- CHITS
-- ============================================================
create table chits (
  id           uuid primary key default gen_random_uuid(),
  kind         chit_kind not null,
  start_date   date not null,
  end_date     date,
  monthly_amt  numeric(14,2) not null,
  total_months integer not null,
  notes        text,
  created_at   timestamptz not null default now()
);

create table chit_members (
  id           uuid primary key default gen_random_uuid(),
  chit_id      uuid not null references chits(id) on delete cascade,
  customer_id  uuid references customers(id),
  ticket_no    integer not null
);

-- ============================================================
-- WALK-INS (counter sales without customer account)
-- ============================================================
create table walk_ins (
  id           uuid primary key default gen_random_uuid(),
  sale_date    date not null default current_date,
  description  text not null,
  amount       numeric(14,2) not null,
  mode         payment_mode not null default 'cash',
  notes        text,
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now()
);

-- ============================================================
-- TRIGGERS
-- ============================================================
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles(id, display_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email), 'staff');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY (permissive for internal app)
-- ============================================================
alter table profiles             enable row level security;
alter table board_rates          enable row level security;
alter table customers            enable row level security;
alter table suppliers            enable row level security;
alter table fy_serials           enable row level security;
alter table sales                enable row level security;
alter table sale_items           enable row level security;
alter table sale_payments        enable row level security;
alter table orders               enable row level security;
alter table order_items          enable row level security;
alter table payments             enable row level security;
alter table supplier_purchases   enable row level security;
alter table supplier_payments    enable row level security;
alter table cash_ledger          enable row level security;
alter table bank_ledger          enable row level security;
alter table old_metal_intake     enable row level security;
alter table melt_batches         enable row level security;
alter table melt_batch_items     enable row level security;
alter table loans                enable row level security;
alter table loan_payments        enable row level security;
alter table expense_categories   enable row level security;
alter table expenses             enable row level security;
alter table scrap_entries        enable row level security;
alter table chits                enable row level security;
alter table chit_members         enable row level security;
alter table walk_ins             enable row level security;

-- Allow all authenticated users full access (internal app)
do $$
declare
  tbl text;
  tables text[] := array[
    'profiles','board_rates','customers','suppliers','fy_serials',
    'sales','sale_items','sale_payments','orders','order_items','payments',
    'supplier_purchases','supplier_payments','cash_ledger','bank_ledger',
    'old_metal_intake','melt_batches','melt_batch_items',
    'loans','loan_payments','expense_categories','expenses',
    'scrap_entries','chits','chit_members','walk_ins'
  ];
begin
  foreach tbl in array tables loop
    execute format('create policy "auth_all" on %I for all to authenticated using (true) with check (true)', tbl);
  end loop;
end;
$$;
