-- Migration 041: Find and remove spurious cash_ledger entries for chit_metal
-- and any sale-linked payments that were incorrectly fanned out to cash_ledger

-- DIAGNOSTIC: Run this SELECT first to see what will be deleted
-- SELECT cl.id, cl.tx_date, cl.direction, cl.amount, cl.description, cl.ref_type, cl.ref_id,
--        p.mode, p.notes, p.sale_id
-- FROM cash_ledger cl
-- JOIN payments p ON p.id = cl.ref_id AND cl.ref_type = 'payment'
-- WHERE p.sale_id IS NOT NULL
-- ORDER BY cl.tx_date;

-- DELETE any cash_ledger entries that are linked to a payment which is itself
-- linked to a sale (sale_id IS NOT NULL) — these should never have existed;
-- the sale's cash payment is already captured via ref_type='sale' in cash_ledger.
DELETE FROM cash_ledger
WHERE ref_type = 'payment'
  AND ref_id IN (
    SELECT id FROM payments
    WHERE sale_id IS NOT NULL
      AND direction = 'in'
  );

-- Also clean up any bank_ledger entries similarly linked to sale payments
-- (these duplicate the ref_type='sale' bank_ledger entry from fanoutLedger)
DELETE FROM bank_ledger
WHERE ref_type = 'payment'
  AND ref_id IN (
    SELECT id FROM payments
    WHERE sale_id IS NOT NULL
      AND direction = 'in'
  );
