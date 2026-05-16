-- ============================================================
-- Migration 009: Chit Metal payment mode
-- Run in Supabase SQL Editor (safe to run multiple times)
-- ============================================================

-- Add chit_metal to payment_mode enum
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'chit_metal'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'payment_mode')
  ) THEN
    ALTER TYPE payment_mode ADD VALUE 'chit_metal';
  END IF;
END $$;

-- Add avg deposit rate column to sale_payments (used by chit_metal rows)
ALTER TABLE sale_payments ADD COLUMN IF NOT EXISTS rate numeric(14,4);
