-- Bank statement upload + reconciliation
CREATE TABLE IF NOT EXISTS bank_statements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month       VARCHAR(7) NOT NULL UNIQUE,  -- YYYY-MM
  bank_name   TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  created_by  UUID REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS bank_statement_entries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id UUID NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE,
  tx_date      DATE NOT NULL,
  description  TEXT,
  debit        NUMERIC(12,2) NOT NULL DEFAULT 0,
  credit       NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance      NUMERIC(12,2),
  ignored      BOOLEAN NOT NULL DEFAULT false,
  row_order    INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_bse_statement ON bank_statement_entries(statement_id, row_order);
CREATE INDEX IF NOT EXISTS idx_bse_date ON bank_statement_entries(tx_date);

ALTER TABLE bank_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statement_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_rw_bank_statements" ON bank_statements
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "admin_rw_bank_entries" ON bank_statement_entries
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
