-- Add stone weight to supplier purchases
ALTER TABLE supplier_purchases
  ADD COLUMN IF NOT EXISTS stone_wt NUMERIC(10,4) NOT NULL DEFAULT 0;
