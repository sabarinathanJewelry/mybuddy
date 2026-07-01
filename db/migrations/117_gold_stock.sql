create table gold_stock_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  stock_type text not null check (stock_type in ('vault', 'outer')),
  category text not null,
  total_weight_g numeric(10,3) not null,
  qty integer,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(entry_date, stock_type, category)
);

alter table gold_stock_entries enable row level security;
create policy "auth users" on gold_stock_entries
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
