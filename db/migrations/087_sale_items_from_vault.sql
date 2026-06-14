-- Migration 087: Mark sale items as sourced from vault/stock
ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS from_vault boolean NOT NULL DEFAULT false;
