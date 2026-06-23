-- Company investments tracker
-- investments: money deployed out (FD, stocks, partner business, etc.)
-- investment_returns: money coming back (interest, withdrawal, profit)

CREATE TABLE IF NOT EXISTS investments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invest_date  DATE NOT NULL,
  name         TEXT NOT NULL,
  amount       NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  mode         TEXT NOT NULL DEFAULT 'cash' CHECK (mode IN ('cash', 'bank')),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS investment_returns (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investment_id  UUID NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
  return_date    DATE NOT NULL,
  amount         NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  mode           TEXT NOT NULL DEFAULT 'cash' CHECK (mode IN ('cash', 'bank')),
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE investment_returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin access investments" ON investments
  FOR ALL USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'subadmin')
  ));

CREATE POLICY "admin access investment_returns" ON investment_returns
  FOR ALL USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'subadmin')
  ));
