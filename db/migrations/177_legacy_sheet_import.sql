-- 177: Monthly Google Sheet history (FY 2024-25 etc.) imported from xlsx for comparison with MyBuddy data

CREATE TABLE IF NOT EXISTS legacy_imports (
  id           uuid primary key default gen_random_uuid(),
  month        date not null unique,
  file_name    text not null,
  sheet_totals jsonb not null default '{}'::jsonb,
  issues       jsonb not null default '[]'::jsonb,
  imported_at  timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS legacy_entries (
  id          uuid primary key default gen_random_uuid(),
  import_id   uuid not null references legacy_imports(id) on delete cascade,
  kind        text not null check (kind in ('gold_sale', 'silver_sale', 'non_rsj', 'old_in', 'order', 'expense')),
  entry_date  date,
  shop        text,
  item        text,
  item_raw    text,
  type        text,
  qty         numeric(10,2),
  weight      numeric(12,3),
  weight2     numeric(12,3),
  amount      numeric(14,2)
);

CREATE INDEX IF NOT EXISTS legacy_entries_import_idx ON legacy_entries(import_id);
CREATE INDEX IF NOT EXISTS legacy_entries_kind_date_idx ON legacy_entries(kind, entry_date);

ALTER TABLE legacy_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_legacy_imports" ON legacy_imports FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "admin_all_legacy_entries" ON legacy_entries FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
