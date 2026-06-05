-- Add flags to control whether stone/HM charges go to pure weight or cash balance
ALTER TABLE supplier_purchases
  ADD COLUMN IF NOT EXISTS stone_to_cash BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS charges_to_cash BOOLEAN NOT NULL DEFAULT false;
