-- ============================================================
-- Migration 006: Link sale payments to the payments table
-- Run in Supabase SQL Editor (safe to run multiple times)
-- ============================================================

-- Add sale_id so we can wipe & re-insert payment rows when a sale is edited
ALTER TABLE payments ADD COLUMN IF NOT EXISTS sale_id uuid references sales(id) ON DELETE CASCADE;

-- Index for fast cleanup during sale updates
CREATE INDEX IF NOT EXISTS payments_sale_id_idx ON payments(sale_id) WHERE sale_id IS NOT NULL;
