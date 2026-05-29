-- Migration 043: Fix old_gold and old_silver payments incorrectly stored as mode='cash'
-- fanoutLedger was mapping old_gold/old_silver → 'cash' in the customer tracking payments row.
-- This caused the Payments page to show "+₹X Cash" for metal exchanges — misleading.
-- Customer balances are NOT affected (view uses direction='in' regardless of mode).
-- Cash ledger is NOT affected (old_gold never touched cash_ledger).
--
-- NOTE on orders: old_gold from orders is stored in old_metal_intake with source_type='order'
-- and in order_payments with correct mode='old_gold'. It does NOT go into the payments table,
-- so no fix needed there for orders.

-- DIAGNOSTIC: run this SELECT first to preview what will be updated
-- SELECT id, pay_date, mode, amount, notes, sale_id
-- FROM payments
-- WHERE sale_id IS NOT NULL AND direction = 'in' AND mode = 'cash'
--   AND (notes ILIKE 'Old gold%' OR notes ILIKE 'Old silver%')
-- ORDER BY pay_date DESC;

-- Fix old gold payments
UPDATE payments
SET mode = 'old_gold'
WHERE sale_id IS NOT NULL
  AND direction = 'in'
  AND mode = 'cash'
  AND notes ILIKE 'Old gold%';

-- Fix old silver payments
UPDATE payments
SET mode = 'old_silver'
WHERE sale_id IS NOT NULL
  AND direction = 'in'
  AND mode = 'cash'
  AND notes ILIKE 'Old silver%';
