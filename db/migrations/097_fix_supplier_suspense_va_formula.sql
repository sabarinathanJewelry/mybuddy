-- Migration 097: Fix supplier suspense VA% formula
-- supplier_va_pct is the TOTAL settlement purity % (not additive to base purity)
-- Old (wrong): gross_wt * (purity_pct + va_pct) / 100
-- New (correct): gross_wt * va_pct / 100
-- Run in Supabase SQL Editor

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
        THEN si.gross_wt * si.supplier_va_pct / 100.0
      ELSE si.pure_wt
    END AS supplier_pure_wt,
    si.line_total
  FROM sale_items si
  JOIN sales s ON s.id = si.sale_id
  WHERE si.is_suspense = true;
