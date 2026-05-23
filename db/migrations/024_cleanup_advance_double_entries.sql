-- Migration 024: Clean up advance payment double-count entries
-- When a sale used mode="advance", the fanout incorrectly created a direction='in'
-- payments row. The customer's advance was already counted when they originally
-- deposited (cash/bank). These duplicate entries inflate the customer balance.
-- Safe to delete: normal sale payments never use mode='advance' in the payments table.

DELETE FROM payments
WHERE direction = 'in'
  AND mode = 'advance'
  AND sale_id IS NOT NULL;
