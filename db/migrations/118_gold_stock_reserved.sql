alter table gold_stock_entries
  add column if not exists reserved_weight_g numeric(10,3) not null default 0,
  add column if not exists reserved_qty integer not null default 0,
  add column if not exists reserved_notes text;
