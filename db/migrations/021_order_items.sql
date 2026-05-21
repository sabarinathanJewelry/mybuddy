-- Migration 021: Order line items
CREATE TABLE IF NOT EXISTS order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references orders(id) on delete cascade,
  description  text,
  metal        text,
  estimated_wt numeric(10,3) default 0,
  amount       numeric(14,2) default 0,
  notes        text,
  sort_order   int default 0,
  created_at   timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items(order_id);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='order_items' AND policyname='auth_all'
  ) THEN
    CREATE POLICY "auth_all" ON order_items FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;
