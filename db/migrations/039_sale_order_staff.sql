-- Responsible staff on sales and orders for accountability / follow-up
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS salesperson1_id UUID REFERENCES staff(id),
  ADD COLUMN IF NOT EXISTS salesperson2_id UUID REFERENCES staff(id),
  ADD COLUMN IF NOT EXISTS marketing_staff_id UUID REFERENCES staff(id);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS salesperson1_id UUID REFERENCES staff(id),
  ADD COLUMN IF NOT EXISTS salesperson2_id UUID REFERENCES staff(id),
  ADD COLUMN IF NOT EXISTS marketing_staff_id UUID REFERENCES staff(id);
