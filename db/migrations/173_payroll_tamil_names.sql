ALTER TABLE payroll_sheets
  ADD COLUMN IF NOT EXISTS tamil_names jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS applied_inc_sheet_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
