-- Metal balance adjustments (touch corrections) stored in supplier_purchases
-- pure_wt is signed: positive = supplier adds weight, negative = deduction
ALTER TABLE supplier_purchases
  ADD COLUMN IF NOT EXISTS is_adjustment BOOLEAN NOT NULL DEFAULT false;
