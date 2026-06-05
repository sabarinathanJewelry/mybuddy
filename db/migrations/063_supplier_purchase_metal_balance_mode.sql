-- Flag to track purchase as metal weight owed (not cash price)
ALTER TABLE supplier_purchases
  ADD COLUMN IF NOT EXISTS is_metal_balance BOOLEAN NOT NULL DEFAULT false;
