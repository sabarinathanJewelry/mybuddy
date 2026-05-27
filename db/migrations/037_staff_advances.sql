-- Staff advances and repayments
-- type='given'  → shop paid advance to staff (cash out)
-- type='repaid' → staff returned money before salary (cash in)
CREATE TABLE IF NOT EXISTS staff_advances (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id     UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  advance_date DATE NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('given', 'repaid')),
  amount       NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_advances_staff ON staff_advances (staff_id, advance_date DESC);
