-- Migration 022: Migrate existing order data into order_items
-- Creates order_items table (safe if already exists) and
-- populates one line item per order from orders.description / estimated_wt / total
-- Safe to run multiple times.

-- 1. Ensure order_items table exists (idempotent)
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

-- 2. Add sort_order column if it doesn't exist
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS sort_order int default 0;

-- 3. Insert one order_item for each order that has no items yet
INSERT INTO order_items (order_id, description, estimated_wt, amount, sort_order)
SELECT
  o.id,
  COALESCE(o.description, 'Order'),
  COALESCE(o.estimated_wt, 0),
  COALESCE(o.total, 0),
  0
FROM orders o
WHERE NOT EXISTS (
  SELECT 1 FROM order_items oi WHERE oi.order_id = o.id
);
