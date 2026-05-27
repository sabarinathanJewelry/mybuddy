-- Seed common expense categories
-- ON CONFLICT (name) requires a unique constraint on expense_categories.name
ALTER TABLE expense_categories ADD CONSTRAINT IF NOT EXISTS expense_categories_name_key UNIQUE (name);

INSERT INTO expense_categories (name) VALUES
  ('Post Office RD'),
  ('Local Chit Payment'),
  ('Staff Salary'),
  ('Shop Maintenance'),
  ('Electricity'),
  ('Vehicle / Fuel'),
  ('Stationery')
ON CONFLICT (name) DO NOTHING;
