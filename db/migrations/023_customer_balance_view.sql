-- Migration 023: Customer balance view
-- Computes per-customer balance: opening_balance - sales + payments_in - payments_out + writeoffs
-- Negative balance = customer owes the company; positive = customer has advance credit

CREATE OR REPLACE VIEW customer_balances AS
SELECT
  c.id,
  c.name,
  c.phone,
  c.opening_balance,
  COALESCE(s.total_sales,    0) AS total_sales,
  COALESCE(pi.total_paid_in, 0) AS total_paid_in,
  COALESCE(po.total_paid_out,0) AS total_paid_out,
  COALESCE(sc.total_writeoff,0) AS total_writeoff,
  c.opening_balance
    - COALESCE(s.total_sales,    0)
    + COALESCE(pi.total_paid_in, 0)
    - COALESCE(po.total_paid_out,0)
    + COALESCE(sc.total_writeoff,0)
  AS balance
FROM customers c
LEFT JOIN (
  SELECT customer_id, SUM(total) AS total_sales
  FROM sales
  WHERE status = 'confirmed' AND customer_id IS NOT NULL
  GROUP BY customer_id
) s  ON s.customer_id  = c.id
LEFT JOIN (
  SELECT customer_id, SUM(amount) AS total_paid_in
  FROM payments
  WHERE direction = 'in' AND customer_id IS NOT NULL
  GROUP BY customer_id
) pi ON pi.customer_id = c.id
LEFT JOIN (
  SELECT customer_id, SUM(amount) AS total_paid_out
  FROM payments
  WHERE direction = 'out' AND customer_id IS NOT NULL
  GROUP BY customer_id
) po ON po.customer_id = c.id
LEFT JOIN (
  SELECT customer_id, SUM(amount) AS total_writeoff
  FROM scrap_entries
  WHERE customer_id IS NOT NULL
  GROUP BY customer_id
) sc ON sc.customer_id = c.id;

GRANT SELECT ON customer_balances TO authenticated;
