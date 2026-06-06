-- Mark a supplier_purchase row as an item return (reduces metal balance)
ALTER TABLE supplier_purchases
  ADD COLUMN IF NOT EXISTS is_return BOOLEAN NOT NULL DEFAULT false;
