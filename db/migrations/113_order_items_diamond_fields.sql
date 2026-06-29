-- Add diamond-specific fields to order_items
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS diamond_wt       NUMERIC(10,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS diamond_amt      NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS certificate_amt  NUMERIC(12,2) DEFAULT 0;
