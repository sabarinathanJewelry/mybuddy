-- ============================================================
-- Migration 003: Walk-in daily summary, personal chit payments,
--                metal dispatches, melt batch purity column
-- Run in Supabase SQL Editor (safe to run multiple times)
-- ============================================================

-- 1. Walk-in daily summary table
CREATE TABLE IF NOT EXISTS walk_in_summaries (
  id              uuid primary key default gen_random_uuid(),
  summary_date    date not null,
  gold_walkin     integer not null default 0,
  silver_walkin   integer not null default 0,
  other_walkin    integer not null default 0,
  gold_walkout    integer not null default 0,
  silver_walkout  integer not null default 0,
  other_walkout   integer not null default 0,
  notes           text,
  created_by      uuid references profiles(id),
  created_at      timestamptz not null default now()
);

-- Allow only one summary record per day
CREATE UNIQUE INDEX IF NOT EXISTS walk_in_summaries_date_uidx ON walk_in_summaries(summary_date);

ALTER TABLE walk_in_summaries ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='walk_in_summaries' AND policyname='auth_all') THEN
    CREATE POLICY "auth_all" ON walk_in_summaries FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 2. Personal chit payments table (create only if not already present)
CREATE TABLE IF NOT EXISTS chit_payments (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references customers(id),
  pay_date     date not null default current_date,
  metal_type   text not null default 'gold' CHECK (metal_type IN ('gold', 'silver')),
  amount       numeric(14,2) not null,
  mode         payment_mode not null default 'cash',
  board_rate   numeric(12,2) not null,
  metal_grams  numeric(10,4) not null,
  notes        text,
  created_at   timestamptz not null default now()
);

ALTER TABLE chit_payments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='chit_payments' AND policyname='auth_all') THEN
    CREATE POLICY "auth_all" ON chit_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 3. Add output_purity_pct to melt_batches (for recording actual refinery purity)
ALTER TABLE melt_batches ADD COLUMN IF NOT EXISTS output_purity_pct numeric(6,2);

-- 4. Metal dispatches — where refined/pure gold/silver is sent
CREATE TABLE IF NOT EXISTS metal_dispatches (
  id             uuid primary key default gen_random_uuid(),
  dispatch_date  date not null default current_date,
  metal          text not null CHECK (metal IN ('gold', 'silver')),
  weight_g       numeric(10,3) not null,
  purpose        text not null CHECK (purpose IN ('supplier', 'goldsmith', 'sale', 'other')),
  party_name     text,
  supplier_id    uuid references suppliers(id),
  batch_id       uuid references melt_batches(id),
  notes          text,
  created_at     timestamptz not null default now()
);

ALTER TABLE metal_dispatches ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='metal_dispatches' AND policyname='auth_all') THEN
    CREATE POLICY "auth_all" ON metal_dispatches FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 5. Add silver_mpr to metal_kind enum if missing
ALTER TYPE metal_kind ADD VALUE IF NOT EXISTS 'silver_mpr';
