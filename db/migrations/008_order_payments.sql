-- ============================================================
-- Migration 008: Order payments (multi-mode advance tracking)
-- Run in Supabase SQL Editor (safe to run multiple times)
-- ============================================================

-- Multiple advance payments per order (cash, UPI, bank, old gold, old silver)
CREATE TABLE IF NOT EXISTS order_payments (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  pay_date      date not null default current_date,
  mode          text not null, -- cash | upi | bank | old_gold | old_silver
  amount        numeric(14,2) not null default 0,
  metal_wt      numeric(10,3),
  metal_purity  numeric(6,2),
  notes         text,
  created_at    timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS order_payments_order_id_idx ON order_payments(order_id);

ALTER TABLE order_payments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='order_payments' AND policyname='auth_all'
  ) THEN
    CREATE POLICY "auth_all" ON order_payments FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Add final delivery columns to orders (actual weight/total set at delivery)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS final_wt    numeric(10,3);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS final_total numeric(14,2);
