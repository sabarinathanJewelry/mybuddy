-- AV Income: commission / facilitation profit (gold loan transfers, etc.)
CREATE TABLE IF NOT EXISTS av_income (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  income_date DATE NOT NULL,
  amount      NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  mode        TEXT NOT NULL DEFAULT 'cash' CHECK (mode IN ('cash', 'bank', 'upi')),
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE av_income ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin full access av_income" ON av_income
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'subadmin')));
