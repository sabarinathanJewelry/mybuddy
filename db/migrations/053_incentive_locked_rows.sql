-- Migration 053: Add locked_rows to incentive_sheets
-- Tracks which incentive rows have been paid (locked) per staff member.
-- Structure: { "rowIdx": { "staff": "NAME", "period": "May 2026" } }
-- Locked rows are excluded from future incentive calculations for that staff.

ALTER TABLE incentive_sheets
  ADD COLUMN IF NOT EXISTS locked_rows JSONB NOT NULL DEFAULT '{}';
