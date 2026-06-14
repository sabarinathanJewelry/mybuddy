-- Migration 085: Add bonus_balance to customers for chit bonus redemption
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS bonus_balance numeric(14,2) NOT NULL DEFAULT 0;
