-- Add stone price per gram to supplier purchases
ALTER TABLE supplier_purchases
  ADD COLUMN IF NOT EXISTS stone_rate NUMERIC(10,2) NOT NULL DEFAULT 0;
