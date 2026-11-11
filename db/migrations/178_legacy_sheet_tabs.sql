-- 178: Full cell-by-cell copy of every tab of each imported monthly sheet, so the original Google Sheets can be retired

CREATE TABLE IF NOT EXISTS legacy_sheet_tabs (
  id          uuid primary key default gen_random_uuid(),
  import_id   uuid not null references legacy_imports(id) on delete cascade,
  tab_name    text not null,
  sort_order  int not null default 0,
  row_count   int not null default 0,
  rows        jsonb not null default '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS legacy_sheet_tabs_import_idx ON legacy_sheet_tabs(import_id);

ALTER TABLE legacy_sheet_tabs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_legacy_sheet_tabs" ON legacy_sheet_tabs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
