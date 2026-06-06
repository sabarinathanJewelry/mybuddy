-- Per-supplier pure weight round-off settings
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS roundoff_digits SMALLINT  NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS roundoff_method TEXT      NOT NULL DEFAULT 'round';
-- roundoff_method: 'round' (nearest), 'floor' (always down), 'ceil' (always up)
