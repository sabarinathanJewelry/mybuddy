-- Add change_due and change_mode columns to sales table
-- Used when old gold (or any payment) exceeds the bill total
-- change_mode: 'cash_back' = excess paid out to customer, 'advance' = kept as customer credit

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS change_due  NUMERIC(12,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS change_mode TEXT          DEFAULT NULL;
