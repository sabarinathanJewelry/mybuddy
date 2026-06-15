-- 091: Convert delivered orders to sales for reporting
-- Adds order_id FK to sales to track source and prevent duplicate conversion.
-- Historical batch: creates confirmed sales for all currently-delivered orders.
-- Does NOT write to cash_ledger or bank_ledger (already recorded at order payment time).
-- Only adds entries to the payments table (customer balance) for the first time.

-- Step 1: Link sales back to their source order
ALTER TABLE sales ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sales_order_id ON sales(order_id) WHERE order_id IS NOT NULL;

-- Step 2: Create a confirmed sale for each delivered order not yet converted
INSERT INTO sales (bill_no, series, bill_date, customer_id, status, subtotal, gst_amount, total, gst_included, order_id, notes)
SELECT
  o.order_no                                  AS bill_no,
  'O'                                         AS series,
  COALESCE(o.delivery_date, o.order_date)     AS bill_date,
  o.customer_id,
  'confirmed'                                 AS status,
  COALESCE(o.final_total, o.total, 0)         AS subtotal,
  0                                           AS gst_amount,
  COALESCE(o.final_total, o.total, 0)         AS total,
  COALESCE(o.gst_included, false)             AS gst_included,
  o.id                                        AS order_id,
  'Converted from order ' || o.order_no       AS notes
FROM orders o
WHERE o.status = 'delivered'
  AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.order_id = o.id);

-- Step 3a: Insert sale_items for orders that have order_items rows
INSERT INTO sale_items (
  sale_id, description, metal, gross_wt, net_wt, pure_wt,
  rate, va_pct, making_amt, stone_amt, diamond_amt, gst_pct,
  line_total, is_value_entry, sort_order
)
SELECT
  s.id                                                            AS sale_id,
  COALESCE(oi.description, o.description, 'Custom order')        AS description,
  CASE
    WHEN oi.metal IN ('gold_22k','gold_18k','gold_24k','silver','silver_pure','silver_mpr')
    THEN oi.metal::metal_kind
    ELSE 'gold_22k'::metal_kind
  END                                                             AS metal,
  COALESCE(oi.estimated_wt, 0)  AS gross_wt,
  COALESCE(oi.estimated_wt, 0)  AS net_wt,
  COALESCE(oi.estimated_wt, 0)  AS pure_wt,
  0 AS rate,
  0 AS va_pct,
  0 AS making_amt,
  0 AS stone_amt,
  0 AS diamond_amt,
  0 AS gst_pct,
  COALESCE(oi.amount, 0)        AS line_total,
  TRUE                          AS is_value_entry,
  COALESCE(oi.sort_order, 0)    AS sort_order
FROM order_items oi
JOIN orders o  ON oi.order_id = o.id
JOIN sales  s  ON s.order_id  = o.id
WHERE NOT EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id);

-- Step 3b: For older orders with no order_items, create one aggregate item
INSERT INTO sale_items (
  sale_id, description, metal, gross_wt, net_wt, pure_wt,
  rate, va_pct, making_amt, stone_amt, diamond_amt, gst_pct,
  line_total, is_value_entry, sort_order
)
SELECT
  s.id                                                     AS sale_id,
  COALESCE(o.description, 'Custom order')                  AS description,
  'gold_22k'::metal_kind                                   AS metal,
  COALESCE(o.final_wt, o.estimated_wt, 0)  AS gross_wt,
  COALESCE(o.final_wt, o.estimated_wt, 0)  AS net_wt,
  COALESCE(o.final_wt, o.estimated_wt, 0)  AS pure_wt,
  0 AS rate,
  0 AS va_pct,
  0 AS making_amt,
  0 AS stone_amt,
  0 AS diamond_amt,
  0 AS gst_pct,
  COALESCE(o.final_total, o.total, 0)       AS line_total,
  TRUE                                      AS is_value_entry,
  0                                         AS sort_order
FROM orders o
JOIN sales s ON s.order_id = o.id
WHERE NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id)
  AND NOT EXISTS (SELECT 1 FROM sale_items  si WHERE si.sale_id  = s.id);

-- Step 4: Credit customer payments table (does NOT touch cash_ledger / bank_ledger)
-- cash/bank were already logged to those ledgers at order-payment time.
-- This step ensures the customer balance view correctly shows these orders as paid.
INSERT INTO payments (pay_date, direction, mode, amount, customer_id, sale_id, notes)
SELECT
  op.pay_date,
  'in'                                              AS direction,
  op.mode                                           AS mode,
  op.amount,
  o.customer_id,
  s.id                                              AS sale_id,
  'Order payment (converted) — ' || o.order_no      AS notes
FROM order_payments op
JOIN orders o ON op.order_id = o.id
JOIN sales  s ON s.order_id  = o.id
WHERE o.customer_id IS NOT NULL
  AND op.amount > 0
  AND NOT EXISTS (
    SELECT 1 FROM payments p
    WHERE p.sale_id = s.id
  );
