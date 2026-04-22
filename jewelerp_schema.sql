-- ═══════════════════════════════════════════════════════════════
-- JewelERP v6 — Supabase PostgreSQL Schema
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ═══════════════════════════════════════════════════════════════

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── PROFILES (linked to Supabase Auth) ──────────────────────────
create table profiles (
  id          uuid references auth.users primary key,
  full_name   text not null,
  role        text default 'staff' check (role in ('owner','partner','staff')),
  shop_name   text default 'My Jewellery Shop',
  created_at  timestamptz default now()
);
alter table profiles enable row level security;
create policy "Users can view own profile" on profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);
create or replace function handle_new_user() returns trigger as 20
begin
  insert into profiles (id, full_name) values (new.id, new.email);
  return new;
end;
20 language plpgsql security definer;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure handle_new_user();

-- ── BOARD RATES ─────────────────────────────────────────────────
create table board_rates (
  id          uuid default uuid_generate_v4() primary key,
  k22         numeric(10,2) not null default 7450,
  k18         numeric(10,2) not null default 6090,
  k916        numeric(10,2) not null default 7310,
  silver      numeric(10,2) not null default 92,
  diamond     numeric(10,2) not null default 35000,
  platinum    numeric(10,2) not null default 3200,
  updated_at  timestamptz default now(),
  updated_by  uuid references profiles(id)
);
alter table board_rates enable row level security;
create policy "All authenticated can read rates" on board_rates for select using (auth.role() = 'authenticated');
create policy "All authenticated can update rates" on board_rates for all using (auth.role() = 'authenticated');
insert into board_rates (k22, k18, k916, silver, diamond, platinum)
  values (7450, 6090, 7310, 92, 35000, 3200);

-- ── CUSTOMERS ───────────────────────────────────────────────────
create table customers (
  id          uuid default uuid_generate_v4() primary key,
  name        text not null,
  phone       text unique,
  city        text,
  anniversary date,
  notes       text,
  opening_bal numeric(12,2) default 0,
  created_at  timestamptz default now(),
  created_by  uuid references profiles(id)
);
alter table customers enable row level security;
create policy "Auth users can manage customers" on customers for all using (auth.role() = 'authenticated');
create index idx_customers_phone on customers(phone);

-- ── SUPPLIERS ───────────────────────────────────────────────────
create table suppliers (
  id          uuid default uuid_generate_v4() primary key,
  name        text not null,
  phone       text,
  metal_type  text default 'Gold',
  opening_bal numeric(12,2) default 0,
  created_at  timestamptz default now()
);
alter table suppliers enable row level security;
create policy "Auth users can manage suppliers" on suppliers for all using (auth.role() = 'authenticated');

-- ── BILL COUNTERS ───────────────────────────────────────────────
create table bill_counters (
  metal       text primary key,  -- 'gold', 'silver', 'order', 'purchase'
  current_no  integer default 1
);
insert into bill_counters values ('gold',1),('silver',1),('order',1),('purchase',1);

-- Atomic bill number function (prevents duplicate bill numbers)
create or replace function get_next_bill(p_metal text) returns text as 20
declare v_num integer;
begin
  update bill_counters set current_no = current_no + 1
  where metal = p_metal returning current_no - 1 into v_num;
  return case
    when p_metal = 'gold'     then 'G-' || lpad(v_num::text, 4, '0')
    when p_metal = 'silver'   then 'S-' || lpad(v_num::text, 4, '0')
    when p_metal = 'order'    then 'ORD-' || lpad(v_num::text, 4, '0')
    when p_metal = 'purchase' then 'PU-' || lpad(v_num::text, 4, '0')
    else p_metal || '-' || lpad(v_num::text, 4, '0')
  end;
end;
20 language plpgsql;

-- ── SALES ───────────────────────────────────────────────────────
create table sales (
  id           uuid default uuid_generate_v4() primary key,
  bill_no      text unique not null,
  sale_date    date default current_date,
  customer_id  uuid references customers(id),
  customer_name text not null,
  grand_total  numeric(12,2) default 0,
  amount_paid  numeric(12,2) default 0,
  balance      numeric(12,2) generated always as (grand_total - amount_paid) stored,
  created_at   timestamptz default now(),
  created_by   uuid references profiles(id)
);
alter table sales enable row level security;
create policy "Auth users can manage sales" on sales for all using (auth.role() = 'authenticated');

create table sale_items (
  id          uuid default uuid_generate_v4() primary key,
  sale_id     uuid references sales(id) on delete cascade,
  metal       text not null,
  description text,
  quantity    integer default 1,
  weight_g    numeric(10,3) default 0,
  rate_per_g  numeric(10,2) default 0,
  va_pct      numeric(6,3) default 0,
  gst_pct     numeric(4,1) default 0,
  hallmark_amt numeric(10,2) default 0,
  stone_amt   numeric(10,2) default 0,
  diamond_ct  numeric(8,3) default 0,
  item_total  numeric(12,2) not null,
  suspense_id uuid,
  sort_order  integer default 0
);
alter table sale_items enable row level security;
create policy "Auth users can manage sale_items" on sale_items for all using (auth.role() = 'authenticated');

create table sale_payments (
  id          uuid default uuid_generate_v4() primary key,
  sale_id     uuid references sales(id) on delete cascade,
  mode        text not null,
  amount      numeric(12,2) not null,
  exch_wt_g   numeric(10,3) default 0,
  exch_val    numeric(12,2) default 0,
  reference   text,
  created_at  timestamptz default now()
);
alter table sale_payments enable row level security;
create policy "Auth users can manage sale_payments" on sale_payments for all using (auth.role() = 'authenticated');

-- ── ORDERS ──────────────────────────────────────────────────────
create table orders (
  id              uuid default uuid_generate_v4() primary key,
  bill_no         text unique not null,
  order_date      date default current_date,
  delivery_date   date,
  customer_id     uuid references customers(id),
  customer_name   text not null,
  description     text,
  estimated_value numeric(12,2) default 0,
  advance_paid    numeric(12,2) default 0,
  status          text default 'pending' check (status in ('pending','delivered','cancelled')),
  created_at      timestamptz default now(),
  created_by      uuid references profiles(id)
);
alter table orders enable row level security;
create policy "Auth users can manage orders" on orders for all using (auth.role() = 'authenticated');

create table order_items (
  id          uuid default uuid_generate_v4() primary key,
  order_id    uuid references orders(id) on delete cascade,
  metal       text not null,
  description text,
  quantity    integer default 1,
  weight_g    numeric(10,3) default 0,
  rate_per_g  numeric(10,2) default 0,
  va_pct      numeric(6,3) default 0,
  gst_pct     numeric(4,1) default 0,
  item_total  numeric(12,2) not null
);
alter table order_items enable row level security;
create policy "Auth users can manage order_items" on order_items for all using (auth.role() = 'authenticated');

-- ── PAYMENTS / OLD GOLD ─────────────────────────────────────────
create table customer_payments (
  id            uuid default uuid_generate_v4() primary key,
  customer_id   uuid references customers(id),
  customer_name text not null,
  pmt_type      text not null check (pmt_type in ('in','out','oldgold','oldgold-adv')),
  amount        numeric(12,2) not null,
  mode          text,
  pmt_date      date default current_date,
  og_metal      text,
  og_weight_g   numeric(10,3) default 0,
  og_value      numeric(12,2) default 0,
  note          text,
  created_at    timestamptz default now()
);
alter table customer_payments enable row level security;
create policy "Auth users can manage customer_payments" on customer_payments for all using (auth.role() = 'authenticated');

-- ── PURCHASES ───────────────────────────────────────────────────
create table purchases (
  id            uuid default uuid_generate_v4() primary key,
  bill_no       text not null,
  purchase_date date default current_date,
  supplier_id   uuid references suppliers(id),
  supplier_name text not null,
  total_value   numeric(12,2) default 0,
  created_at    timestamptz default now()
);
alter table purchases enable row level security;
create policy "Auth users can manage purchases" on purchases for all using (auth.role() = 'authenticated');

create table purchase_items (
  id          uuid default uuid_generate_v4() primary key,
  purchase_id uuid references purchases(id) on delete cascade,
  description text,
  metal       text,
  gross_g     numeric(10,3) default 0,
  pure_g      numeric(10,3) default 0,
  va_pct      numeric(6,3) default 0
);
alter table purchase_items enable row level security;
create policy "Auth users can manage purchase_items" on purchase_items for all using (auth.role() = 'authenticated');

-- ── EXPENSES ────────────────────────────────────────────────────
create table expenses (
  id           uuid default uuid_generate_v4() primary key,
  expense_date date default current_date,
  amount       numeric(12,2) not null,
  category     text not null,
  mode         text default 'Cash',
  description  text,
  created_at   timestamptz default now(),
  created_by   uuid references profiles(id)
);
alter table expenses enable row level security;
create policy "Auth users can manage expenses" on expenses for all using (auth.role() = 'authenticated');

-- ── CASH LOG ────────────────────────────────────────────────────
create table cash_log (
  id          uuid default uuid_generate_v4() primary key,
  log_type    text not null check (log_type in ('in','out','opening')),
  log_date    date default current_date,
  amount      numeric(12,2) not null,
  description text not null,
  source      text,  -- 'sale', 'payment', 'expense', 'supplier', 'manual'
  ref_id      uuid,  -- ID of the related record
  created_at  timestamptz default now()
);
alter table cash_log enable row level security;
create policy "Auth users can manage cash_log" on cash_log for all using (auth.role() = 'authenticated');

-- ── OLD METAL ITEMS (unbatched) ──────────────────────────────────
create table old_metal_items (
  id          uuid default uuid_generate_v4() primary key,
  metal       text not null,
  weight_g    numeric(10,3) not null,
  value_inr   numeric(12,2) default 0,
  item_date   date default current_date,
  source      text,
  is_batched  boolean default false,
  batch_id    uuid,
  created_at  timestamptz default now()
);
alter table old_metal_items enable row level security;
create policy "Auth users can manage old_metal_items" on old_metal_items for all using (auth.role() = 'authenticated');

-- ── REFINERY BATCHES ────────────────────────────────────────────
create table refinery_batches (
  id            uuid default uuid_generate_v4() primary key,
  metal         text not null,
  refinery_name text not null,
  total_wt_g    numeric(10,3) not null,
  sent_date     date default current_date,
  return_wt_g   numeric(10,3),
  purity_pct    numeric(6,3),
  pure999_g     numeric(10,3) generated always as (
    case when return_wt_g is not null and purity_pct is not null
    then round(return_wt_g * purity_pct / 100, 3) else null end
  ) stored,
  status        text default 'pending' check (status in ('pending','completed')),
  completed_at  timestamptz,
  created_at    timestamptz default now()
);
alter table refinery_batches enable row level security;
create policy "Auth users can manage refinery_batches" on refinery_batches for all using (auth.role() = 'authenticated');

-- ── METAL LOG ───────────────────────────────────────────────────
create table metal_log (
  id          uuid default uuid_generate_v4() primary key,
  log_type    text not null,  -- 'in', 'out', 'refinery_complete'
  log_date    date default current_date,
  metal       text not null,
  weight_g    numeric(10,3),
  source      text,
  purpose     text,
  purity_pct  numeric(6,3),
  rate_per_g  numeric(10,2),
  ref_id      uuid,
  created_at  timestamptz default now()
);
alter table metal_log enable row level security;
create policy "Auth users can manage metal_log" on metal_log for all using (auth.role() = 'authenticated');

-- ── SUPPLIER TRANSACTIONS ────────────────────────────────────────
create table supplier_transactions (
  id              uuid default uuid_generate_v4() primary key,
  supplier_id     uuid references suppliers(id),
  txn_type        text not null,  -- 'purchase', 'settlement', 'suspense_sold'
  txn_date        date default current_date,
  debit_inr       numeric(12,2) default 0,
  credit_inr      numeric(12,2) default 0,
  description     text,
  reference       text,
  created_at      timestamptz default now()
);
alter table supplier_transactions enable row level security;
create policy "Auth users can manage supplier_transactions" on supplier_transactions for all using (auth.role() = 'authenticated');

-- ── SUSPENSE STOCK ───────────────────────────────────────────────
create table suspense_items (
  id            uuid default uuid_generate_v4() primary key,
  supplier_id   uuid references suppliers(id),
  description   text not null,
  metal         text not null,
  gross_wt_g    numeric(10,3) default 0,
  va_pct        numeric(6,3) default 0,
  mc_stone_inr  numeric(12,2) default 0,
  tag           text,
  status        text default 'available' check (status in ('available','sold','returned')),
  sold_bill_no  text,
  sold_date     date,
  added_date    date default current_date,
  created_at    timestamptz default now()
);
alter table suspense_items enable row level security;
create policy "Auth users can manage suspense_items" on suspense_items for all using (auth.role() = 'authenticated');

-- ═══════════════════════════════════════════════════════════════
-- USEFUL VIEWS
-- ═══════════════════════════════════════════════════════════════

-- Current board rates (latest row)
create or replace view current_rates as
  select * from board_rates order by updated_at desc limit 1;

-- Customer ledger summary
create or replace view customer_ledger as
  select
    c.id, c.name, c.phone, c.city,
    coalesce(sum(s.grand_total), 0) as total_sales,
    coalesce(sum(s.amount_paid), 0) as total_paid,
    coalesce(sum(s.balance), 0) + c.opening_bal as balance_due
  from customers c
  left join sales s on s.customer_id = c.id
  group by c.id, c.name, c.phone, c.city, c.opening_bal;

-- Metal reserve summary
create or replace view metal_reserve as
  select
    metal,
    sum(case when log_type = 'in' then weight_g else 0 end) -
    sum(case when log_type = 'out' then weight_g else 0 end) as available_g,
    count(*) filter (where log_type = 'in') as inflow_count,
    count(*) filter (where log_type = 'out') as outflow_count
  from metal_log
  group by metal;

-- ═══════════════════════════════════════════════════════════════
-- NEXT STEPS AFTER RUNNING THIS SCHEMA:
-- 1. Go to Supabase Dashboard > Settings > API
-- 2. Copy Project URL and anon/public key
-- 3. Open JewelERP > Settings page
-- 4. Paste URL and key and click Save & Connect
-- 5. Add import logic to sync local data to Supabase
-- ═══════════════════════════════════════════════════════════════
