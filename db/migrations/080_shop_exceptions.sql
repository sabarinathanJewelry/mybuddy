-- 080: Shop late-opening exceptions
-- When the shop itself opens late, staff arriving around that time should not be marked late.
CREATE TABLE IF NOT EXISTS shop_exceptions (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  exception_date DATE NOT NULL UNIQUE,
  shop_opens_at  TIME NOT NULL,          -- e.g. '09:55:00'
  reason         TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE shop_exceptions ENABLE ROW LEVEL SECURITY;

-- Admin can manage; staff can read (so their own view respects exceptions)
CREATE POLICY "admin_all" ON shop_exceptions
  FOR ALL TO authenticated
  USING  (coalesce(auth.jwt()->'app_metadata'->>'role', 'admin') != 'staff')
  WITH CHECK (coalesce(auth.jwt()->'app_metadata'->>'role', 'admin') != 'staff');

CREATE POLICY "staff_read" ON shop_exceptions
  FOR SELECT TO authenticated
  USING (true);
