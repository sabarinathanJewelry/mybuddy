-- Migration 054: Add item description and charges_g to supplier_purchases
-- description: item name (e.g. "Bahubali Chain")
-- charges_g:   HM / certificate / postal / stone charges converted to gold grams
--              Final pure wt = gross_wt × (purity_pct/100) + charges_g

ALTER TABLE supplier_purchases
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS charges_g   NUMERIC(10,4) NOT NULL DEFAULT 0;
