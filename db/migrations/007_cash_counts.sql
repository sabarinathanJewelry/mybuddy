-- ============================================================
-- Migration 007: Cash Reconciliation (daily cash count)
-- Run in Supabase SQL Editor (safe to run multiple times)
-- ============================================================

-- One row per day — upsert to update the count for that day.
CREATE TABLE IF NOT EXISTS cash_counts (
  id             uuid primary key default gen_random_uuid(),
  count_date     date not null,
  actual_amount  numeric(14,2) not null,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cash_counts_date_uidx
  ON cash_counts(count_date);

ALTER TABLE cash_counts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='cash_counts' AND policyname='auth_all'
  ) THEN
    CREATE POLICY "auth_all" ON cash_counts FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;
