-- Add supplier link, gross weight and purity to bullion_trades
ALTER TABLE bullion_trades
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gross_wt    NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS purity      NUMERIC(5,2) DEFAULT 100;

-- Add balance_offset to the payment_mode enum (used by bullion_payments)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'balance_offset'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'payment_mode')
  ) THEN
    ALTER TYPE payment_mode ADD VALUE 'balance_offset';
  END IF;
END $$;
