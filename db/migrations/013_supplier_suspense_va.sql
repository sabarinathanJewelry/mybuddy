-- ============================================================
-- Migration 013: Supplier suspense VA% confirmation
-- Adds supplier_va_pct + supplier_confirmed to sale_items so
-- suspense items can have their cost% set post-sale.
-- Recreates supplier_suspense view with new columns.
-- Run in Supabase SQL Editor (safe to run multiple times)
-- ============================================================

ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS supplier_va_pct  numeric(6,2);
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS supplier_confirmed boolean NOT NULL DEFAULT false;

-- Must DROP first — CREATE OR REPLACE can't insert columns before existing ones
DROP VIEW IF EXISTS supplier_suspense;

CREATE VIEW supplier_suspense AS
  SELECT
    si.id,
    si.sale_id,
    s.bill_no,
    s.bill_date,
    si.supplier_id,
    si.description,
    si.metal,
    si.gross_wt,
    si.purity_pct,
    si.pure_wt,
    si.supplier_va_pct,
    si.supplier_confirmed,
    CASE
      WHEN si.supplier_confirmed = true AND si.supplier_va_pct IS NOT NULL
        THEN si.gross_wt * (si.purity_pct + si.supplier_va_pct) / 100.0
      ELSE si.pure_wt
    END AS supplier_pure_wt,
    si.line_total
  FROM sale_items si
  JOIN sales s ON s.id = si.sale_id
  WHERE si.is_suspense = true;
