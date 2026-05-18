-- ============================================================
-- Migration 015: Store after-melt weight on melt_batches
-- melt_wt = weight after melting (before purity adjustment)
-- output_wt remains the 999-pure equivalent (what enters reserve)
-- Run in Supabase SQL Editor (safe to run multiple times)
-- ============================================================

ALTER TABLE melt_batches ADD COLUMN IF NOT EXISTS melt_wt numeric(10,3);
