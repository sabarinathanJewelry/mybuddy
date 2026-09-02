-- 163: Add deleted_idxs column to incentive_sheets.
-- The app code persists deleted row indexes so they survive save/reload,
-- but the column was never added to the table, causing all saves to fail silently.

ALTER TABLE incentive_sheets
  ADD COLUMN IF NOT EXISTS deleted_idxs JSONB NOT NULL DEFAULT '[]';
