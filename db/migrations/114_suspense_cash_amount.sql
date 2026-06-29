-- Add cash bill amount to suspense items so cash settlements can be tracked
ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS supplier_cash_amt NUMERIC(12,2) DEFAULT 0;

-- Recreate view to expose the new column
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
    si.supplier_cash_amt,
    CASE
      WHEN si.supplier_confirmed = true AND si.supplier_va_pct IS NOT NULL AND si.supplier_va_pct > 0
        THEN si.gross_wt * (si.purity_pct + si.supplier_va_pct) / 100.0
      ELSE si.pure_wt
    END AS supplier_pure_wt,
    si.line_total
  FROM sale_items si
  JOIN sales s ON s.id = si.sale_id
  WHERE si.is_suspense = true;
