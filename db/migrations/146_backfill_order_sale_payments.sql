-- Backfill sale_payments for order-converted sales.
-- convertOrderToSale wrote to payments but not sale_payments, so the
-- sales-list balance column showed full amount as Due for delivered orders.
INSERT INTO sale_payments (sale_id, pay_date, mode, amount, notes)
SELECT p.sale_id, p.pay_date, p.mode, p.amount, COALESCE(p.notes, 'Order payment')
FROM payments p
WHERE p.direction = 'in'
  AND p.sale_id IS NOT NULL
  AND p.sale_id IN (SELECT id FROM sales WHERE order_id IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM sale_payments sp
    WHERE sp.sale_id = p.sale_id
      AND sp.amount = p.amount
      AND sp.pay_date = p.pay_date
      AND sp.mode = p.mode
  );
