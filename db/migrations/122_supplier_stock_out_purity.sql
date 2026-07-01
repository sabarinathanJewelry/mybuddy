-- Add purity % to supplier_stock_out for calculating pure weight
ALTER TABLE supplier_stock_out
  ADD COLUMN IF NOT EXISTS purity_pct numeric(6,3) NOT NULL DEFAULT 91.6;
