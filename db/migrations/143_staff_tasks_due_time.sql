-- 143: Add optional due_time to staff_tasks
ALTER TABLE staff_tasks
  ADD COLUMN IF NOT EXISTS due_time TIME;
