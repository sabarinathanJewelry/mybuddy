-- ============================================================
-- Migration 002: Walk-in entry type + Chit payments table
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Add entry_type (in = bought, out = walked out without buying)
ALTER TABLE walk_ins
  ADD COLUMN IF NOT EXISTS entry_type text NOT NULL DEFAULT 'in'
  CHECK (entry_type IN ('in', 'out'));

-- 2. Add walkout_reason (only filled for entry_type = 'out')
ALTER TABLE walk_ins
  ADD COLUMN IF NOT EXISTS walkout_reason text;

-- 3. Add joined_date to chit_members
ALTER TABLE chit_members
  ADD COLUMN IF NOT EXISTS joined_date date;

-- 4. Create chit_payments table
CREATE TABLE IF NOT EXISTS chit_payments (
  id          uuid primary key default gen_random_uuid(),
  chit_id     uuid not null references chits(id) on delete cascade,
  member_id   uuid not null references chit_members(id) on delete cascade,
  pay_date    date not null default current_date,
  month_no    integer not null,
  amount      numeric(14,2) not null,
  mode        payment_mode not null default 'cash',
  is_advance  boolean not null default false,
  notes       text,
  created_at  timestamptz not null default now()
);

-- 5. Enable RLS + allow all authenticated users
ALTER TABLE chit_payments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'chit_payments' AND policyname = 'auth_all'
  ) THEN
    CREATE POLICY "auth_all" ON chit_payments
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END
$$;

-- 6. Also add silver_mpr to the metal_kind enum if not already present
ALTER TYPE metal_kind ADD VALUE IF NOT EXISTS 'silver_mpr';
