-- ============================================================
-- Migration 005: Opening balances for financial year start
-- Run in Supabase SQL Editor (safe to run multiple times)
-- ============================================================

-- Stores the starting balance for each category at FY start.
-- One row per type per effective date; upsert to update.
CREATE TABLE IF NOT EXISTS opening_balances (
  id             uuid primary key default gen_random_uuid(),
  effective_date date not null,
  balance_type   text not null CHECK (balance_type IN ('cash', 'bank', 'gold_g', 'silver_g')),
  amount         numeric(14,4) not null default 0,
  notes          text,
  created_at     timestamptz not null default now()
);

CREATE UNIQUE INDEX IF NOT EXISTS opening_balances_date_type_uidx
  ON opening_balances(effective_date, balance_type);

ALTER TABLE opening_balances ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='opening_balances' AND policyname='auth_all') THEN
    CREATE POLICY "auth_all" ON opening_balances FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
