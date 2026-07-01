-- Track stock items given OUT from shop to a supplier (consignment/suspense out)
-- e.g., MJ took 0.920g earring from our stock, they will pay us
create table if not exists supplier_stock_out (
  id           uuid primary key default gen_random_uuid(),
  given_date   date not null,
  supplier_id  uuid not null references suppliers(id) on delete cascade,
  description  text not null,
  metal        text not null default 'gold_22k',
  gross_wt     numeric(10,3) not null default 0,
  qty          integer not null default 1,
  rate         numeric(12,2) not null default 0,
  amount       numeric(12,2) not null default 0,
  status       text not null default 'given' check (status in ('given', 'returned', 'settled')),
  settled_date date,
  notes        text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

alter table supplier_stock_out enable row level security;

create policy "auth users manage supplier_stock_out"
  on supplier_stock_out for all
  to authenticated
  using (true)
  with check (true);
