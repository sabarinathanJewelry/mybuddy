-- Partial payouts for old gold / silver purchases
-- agreed_price: total agreed purchase price for the intake
-- old_metal_intake_payouts: individual partial payments against that price

ALTER TABLE old_metal_intake ADD COLUMN IF NOT EXISTS agreed_price NUMERIC(14,2);

CREATE TABLE IF NOT EXISTS old_metal_intake_payouts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_id   UUID NOT NULL REFERENCES old_metal_intake(id) ON DELETE CASCADE,
  pay_date    DATE NOT NULL,
  amount      NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  mode        TEXT NOT NULL DEFAULT 'cash' CHECK (mode IN ('cash', 'bank')),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE old_metal_intake_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin access old_metal_intake_payouts" ON old_metal_intake_payouts
  FOR ALL USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'subadmin')
  ));
