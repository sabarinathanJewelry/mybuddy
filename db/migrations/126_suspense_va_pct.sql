-- Add va_pct to supplier_suspense view so sold touch (purity + VA%) can be shown
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
    si.va_pct,
    si.pure_wt,
    si.supplier_va_pct,
    si.supplier_confirmed,
    si.supplier_cash_amt,
    si.supplier_converted,
    CASE
      WHEN si.supplier_confirmed = true AND si.supplier_va_pct IS NOT NULL AND si.supplier_va_pct > 0
        THEN si.gross_wt * si.supplier_va_pct / 100.0
      ELSE si.pure_wt
    END AS supplier_pure_wt,
    si.line_total
  FROM sale_items si
  JOIN sales s ON s.id = si.sale_id
  WHERE si.is_suspense = true;

GRANT SELECT ON supplier_suspense TO authenticated;
