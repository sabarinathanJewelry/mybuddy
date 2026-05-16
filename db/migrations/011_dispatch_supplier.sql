-- ============================================================
-- Migration 011: Link metal dispatches to supplier
-- Run in Supabase SQL Editor (safe to run multiple times)
-- ============================================================

ALTER TABLE metal_dispatches ADD COLUMN IF NOT EXISTS supplier_id uuid references suppliers(id);
