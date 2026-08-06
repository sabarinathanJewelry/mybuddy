-- Migration 149: Add last_txn_date to customer_balances view
-- Shows the date of the most recent sale, payment, or write-off for each customer

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
  AS balance,
  GREATEST(
    s.last_sale_date,
    pi.last_paid_in_date,
    po.last_paid_out_date,
    sc.last_writeoff_date
  ) AS last_txn_date
FROM customers c
LEFT JOIN (
  SELECT customer_id, SUM(total) AS total_sales, MAX(created_at::date) AS last_sale_date
  FROM sales
  WHERE status = 'confirmed' AND customer_id IS NOT NULL
  GROUP BY customer_id
) s  ON s.customer_id  = c.id
LEFT JOIN (
  SELECT customer_id, SUM(amount) AS total_paid_in, MAX(created_at::date) AS last_paid_in_date
  FROM payments
  WHERE direction = 'in' AND customer_id IS NOT NULL
  GROUP BY customer_id
) pi ON pi.customer_id = c.id
LEFT JOIN (
  SELECT customer_id, SUM(amount) AS total_paid_out, MAX(created_at::date) AS last_paid_out_date
  FROM payments
  WHERE direction = 'out' AND customer_id IS NOT NULL
  GROUP BY customer_id
) po ON po.customer_id = c.id
LEFT JOIN (
  SELECT customer_id, SUM(amount) AS total_writeoff, MAX(created_at::date) AS last_writeoff_date
  FROM scrap_entries
  WHERE customer_id IS NOT NULL
  GROUP BY customer_id
) sc ON sc.customer_id = c.id;

GRANT SELECT ON customer_balances TO authenticated;
