-- 179: Old customer credit ledger (Balance Sheet 24-25 / 25-26 Google Sheets), kept for reference only.
-- Does NOT affect customer_balances.

CREATE TABLE IF NOT EXISTS legacy_credit_entries (
  id          uuid primary key default gen_random_uuid(),
  fy          text not null,
  tab_name    text not null,
  tab_month   date not null,
  row_no      int not null,
  entry_date  date,
  type        text,
  name        text,
  phone       text,
  amount      numeric(14,2),
  paid_date   text,
  paid        numeric(14,2),
  writeoff    numeric(14,2),
  balance     numeric(14,2),
  sheet_balance numeric(14,2),
  advance     numeric(14,2),
  raw         jsonb not null default '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS legacy_credit_fy_idx ON legacy_credit_entries(fy);
CREATE INDEX IF NOT EXISTS legacy_credit_name_idx ON legacy_credit_entries(lower(name));

ALTER TABLE legacy_credit_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_legacy_credit" ON legacy_credit_entries FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
