-- Add purity_pct to metal_dispatches so pure gold sent = weight_g × purity_pct/100
ALTER TABLE metal_dispatches
  ADD COLUMN IF NOT EXISTS purity_pct NUMERIC(6,3) NOT NULL DEFAULT 100;
