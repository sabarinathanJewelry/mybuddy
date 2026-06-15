-- 089: Link supplier payments to a specific purchase (for part-payment tracking)
ALTER TABLE supplier_payments
  ADD COLUMN IF NOT EXISTS purchase_id UUID REFERENCES supplier_purchases(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_supplier_payments_purchase_id ON supplier_payments(purchase_id);
