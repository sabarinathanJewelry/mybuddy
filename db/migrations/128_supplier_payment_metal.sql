-- Tag supplier payments by metal type so cut_rate payments can be split gold vs silver
-- Existing cut_rate rows default to 'gold' (safe assumption per current data entry practice)
ALTER TABLE supplier_payments
  ADD COLUMN IF NOT EXISTS metal TEXT CHECK (metal IN ('gold', 'silver'));

UPDATE supplier_payments
  SET metal = 'gold'
  WHERE mode = 'cut_rate' AND metal IS NULL;
