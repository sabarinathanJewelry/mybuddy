-- Migration 040: Fix chit_metal payments incorrectly stored as mode='cash'
-- fanoutLedger was mapping chit_metal → 'cash' in the customer tracking payments row.
-- This caused the Payments page to show "+₹X Cash" for scheme settlements,
-- and any edit of those records could create spurious cash_ledger entries.

-- Step 1: Remove any spurious cash_ledger entries linked to these wrong payment records
DELETE FROM cash_ledger
WHERE ref_type = 'payment'
  AND ref_id IN (
    SELECT id FROM payments
    WHERE sale_id IS NOT NULL
      AND direction = 'in'
      AND mode = 'cash'
      AND notes ILIKE 'Chit metal%'
  );

-- Step 2: Fix the mode so they no longer appear as cash
UPDATE payments
SET mode = 'chit_metal'
WHERE sale_id IS NOT NULL
  AND direction = 'in'
  AND mode = 'cash'
  AND notes ILIKE 'Chit metal%';
