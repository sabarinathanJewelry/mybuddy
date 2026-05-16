-- ============================================================
-- Migration 012: Widen va_pct on sale_items
-- numeric(6,2) max is 9999.99 — distribution can exceed this
-- when sale total >> item metal value. Widen to numeric(10,2).
-- Run in Supabase SQL Editor (safe to run multiple times)
-- ============================================================

ALTER TABLE sale_items ALTER COLUMN va_pct TYPE numeric(10,2);
