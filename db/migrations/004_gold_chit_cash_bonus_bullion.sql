-- ============================================================
-- Migration 004: Smart Gold Chit, Cash Bonus Scheme, Bullion Trading
-- Run in Supabase SQL Editor (safe to run multiple times)
-- ============================================================

-- 1. Smart Gold Chit — customer brings physical gold, credited to their metal account
CREATE TABLE IF NOT EXISTS gold_savings_deposits (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references customers(id),
  deposit_date date not null default current_date,
  metal_type   text not null default 'gold' CHECK (metal_type IN ('gold', 'silver')),
  gross_wt     numeric(10,3) not null,
  purity_pct   numeric(6,2) not null default 91.6,
  pure_wt      numeric(10,4) not null,
  notes        text,
  created_at   timestamptz not null default now()
);

ALTER TABLE gold_savings_deposits ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='gold_savings_deposits' AND policyname='auth_all') THEN
    CREATE POLICY "auth_all" ON gold_savings_deposits FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 2. Cash Bonus Scheme — customer deposits cash, stays in their balance as advance/credit
CREATE TABLE IF NOT EXISTS cash_savings_deposits (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references customers(id),
  deposit_date date not null default current_date,
  amount       numeric(14,2) not null,
  mode         payment_mode not null default 'cash',
  notes        text,
  created_at   timestamptz not null default now()
);

ALTER TABLE cash_savings_deposits ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cash_savings_deposits' AND policyname='auth_all') THEN
    CREATE POLICY "auth_all" ON cash_savings_deposits FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 3. Bullion Trades — buy/sell pure gold or silver with dealers; partial payments supported
CREATE TABLE IF NOT EXISTS bullion_trades (
  id           uuid primary key default gen_random_uuid(),
  trade_date   date not null default current_date,
  trade_type   text not null CHECK (trade_type IN ('buy', 'sell')),
  party_name   text not null,
  metal        text not null CHECK (metal IN ('gold', 'silver')),
  pure_wt      numeric(10,4) not null,
  rate_per_g   numeric(12,2) not null,
  total_amount numeric(14,2) not null,
  notes        text,
  created_at   timestamptz not null default now()
);

ALTER TABLE bullion_trades ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='bullion_trades' AND policyname='auth_all') THEN
    CREATE POLICY "auth_all" ON bullion_trades FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 4. Bullion Payments — one or more partial payments per bullion trade
CREATE TABLE IF NOT EXISTS bullion_payments (
  id          uuid primary key default gen_random_uuid(),
  trade_id    uuid not null references bullion_trades(id) ON DELETE CASCADE,
  pay_date    date not null default current_date,
  amount      numeric(14,2) not null,
  mode        payment_mode not null default 'cash',
  notes       text,
  created_at  timestamptz not null default now()
);

ALTER TABLE bullion_payments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='bullion_payments' AND policyname='auth_all') THEN
    CREATE POLICY "auth_all" ON bullion_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
