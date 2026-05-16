-- ============================================================
-- Migration 010: Payout tracking on old_metal_intake
-- Run in Supabase SQL Editor (safe to run multiple times)
-- ============================================================

ALTER TABLE old_metal_intake ADD COLUMN IF NOT EXISTS payout_amount numeric(14,2);
ALTER TABLE old_metal_intake ADD COLUMN IF NOT EXISTS payout_mode   text;
