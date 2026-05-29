-- ============================================================
-- DIAGNOSTIC QUERIES — MyBuddy ERP
-- Run these in Supabase SQL Editor when investigating issues
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. CASH LEDGER: breakdown by date and ref_type (April)
--    Use to spot unexpected cash-in sources
-- ────────────────────────────────────────────────────────────
SELECT
  tx_date,
  ref_type,
  COUNT(*) as entries,
  SUM(CASE WHEN direction='in' THEN amount ELSE -amount END) as net
FROM cash_ledger
WHERE tx_date >= '2026-04-01' AND tx_date <= '2026-04-30'
  AND direction = 'in'
GROUP BY tx_date, ref_type
ORDER BY tx_date, ref_type;


-- ────────────────────────────────────────────────────────────
-- 2. CASH LEDGER: daily net (in vs out) for reconciliation
--    Use to find which day the cash gap starts
-- ────────────────────────────────────────────────────────────
SELECT
  tx_date,
  SUM(CASE WHEN direction='in' THEN amount ELSE 0 END) as cash_in,
  SUM(CASE WHEN direction='out' THEN amount ELSE 0 END) as cash_out,
  SUM(CASE WHEN direction='in' THEN amount ELSE -amount END) as net
FROM cash_ledger
WHERE tx_date >= '2026-04-01' AND tx_date <= '2026-04-30'
GROUP BY tx_date
ORDER BY tx_date;


-- ────────────────────────────────────────────────────────────
-- 3. ORDER ADVANCES IN CASH LEDGER for a specific date
--    Use to verify order advance payment modes
--    Change the tx_date value as needed
-- ────────────────────────────────────────────────────────────
SELECT cl.tx_date, cl.amount, cl.description, cl.ref_id,
       o.order_no, c.name as customer_name
FROM cash_ledger cl
LEFT JOIN orders o ON o.id = cl.ref_id::uuid
LEFT JOIN customers c ON c.id = o.customer_id
WHERE cl.tx_date = '2026-04-20'
  AND cl.ref_type = 'order'
  AND cl.direction = 'in'
ORDER BY cl.amount DESC;


-- ────────────────────────────────────────────────────────────
-- 4. SPURIOUS CASH LEDGER entries linked to sale payments
--    Should return 0 rows if data is clean
-- ────────────────────────────────────────────────────────────
SELECT cl.id, cl.tx_date, cl.direction, cl.amount, cl.description,
       p.mode, p.notes, p.sale_id
FROM cash_ledger cl
JOIN payments p ON p.id = cl.ref_id AND cl.ref_type = 'payment'
WHERE p.sale_id IS NOT NULL
ORDER BY cl.tx_date;


-- ────────────────────────────────────────────────────────────
-- 5. PAYMENTS TABLE: chit_metal entries check
--    Should all show mode='chit_metal' (not 'cash') after migration 040
-- ────────────────────────────────────────────────────────────
SELECT id, pay_date, mode, amount, notes, sale_id, direction
FROM payments
WHERE notes ILIKE 'Chit metal%'
ORDER BY pay_date DESC;


-- ────────────────────────────────────────────────────────────
-- 6. CASH LEDGER: all entries for a specific date
--    Use to audit a single day in detail
--    Change the date value as needed
-- ────────────────────────────────────────────────────────────
SELECT tx_date, direction, amount, description, ref_type, ref_id, created_at
FROM cash_ledger
WHERE tx_date = '2026-04-01'
ORDER BY created_at;


-- ────────────────────────────────────────────────────────────
-- 7. BANK LEDGER: daily net for reconciliation
-- ────────────────────────────────────────────────────────────
SELECT
  tx_date,
  SUM(CASE WHEN direction='in' THEN amount ELSE 0 END) as bank_in,
  SUM(CASE WHEN direction='out' THEN amount ELSE 0 END) as bank_out,
  SUM(CASE WHEN direction='in' THEN amount ELSE -amount END) as net
FROM bank_ledger
WHERE tx_date >= '2026-04-01' AND tx_date <= '2026-04-30'
GROUP BY tx_date
ORDER BY tx_date;


-- ────────────────────────────────────────────────────────────
-- 8. CUSTOMER BALANCES: who owes and who has credit
--    Negative balance = customer owes; positive = customer has advance
-- ────────────────────────────────────────────────────────────
SELECT name, opening_balance, total_sales, total_paid_in, total_paid_out, balance
FROM customer_balances
WHERE balance != 0
ORDER BY balance ASC;
