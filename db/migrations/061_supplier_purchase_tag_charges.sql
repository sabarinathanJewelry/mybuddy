-- Add tag weight and per-piece charge fields to supplier purchases
ALTER TABLE supplier_purchases
  ADD COLUMN IF NOT EXISTS tag_wt NUMERIC(10,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS charges_per_piece NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS piece_count INT NOT NULL DEFAULT 0;
