-- ============================================================
-- Migration 014: Metal opening balances on suppliers
-- Run in Supabase SQL Editor (safe to run multiple times)
-- ============================================================

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS gold_opening_g   numeric(10,3) NOT NULL DEFAULT 0;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS silver_opening_g numeric(10,3) NOT NULL DEFAULT 0;
