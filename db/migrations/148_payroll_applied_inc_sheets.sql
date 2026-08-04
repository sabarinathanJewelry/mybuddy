ALTER TABLE payroll_sheets
  ADD COLUMN IF NOT EXISTS applied_inc_sheet_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
