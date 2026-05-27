-- Seed common expense categories
-- Use unique index (ADD CONSTRAINT IF NOT EXISTS is not valid Postgres syntax)
CREATE UNIQUE INDEX IF NOT EXISTS expense_categories_name_key ON expense_categories (name);

INSERT INTO expense_categories (name) VALUES
  ('Post Office RD'),
  ('Local Chit Payment'),
  ('Staff Salary'),
  ('Shop Maintenance'),
  ('Electricity'),
  ('Vehicle / Fuel'),
  ('Stationery')
ON CONFLICT (name) DO NOTHING;
