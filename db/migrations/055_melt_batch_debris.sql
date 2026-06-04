-- Track debris (gold fragments too small to sell) separated at refinery
ALTER TABLE melt_batches
  ADD COLUMN IF NOT EXISTS debris_wt NUMERIC(10,3) DEFAULT 0;
