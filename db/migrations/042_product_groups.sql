-- Migration 042: product_groups table + group_id on products

CREATE TABLE IF NOT EXISTS product_groups (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT    NOT NULL,
  parent_id  UUID    REFERENCES product_groups(id) ON DELETE SET NULL,
  metal      TEXT    NOT NULL DEFAULT 'gold_22k',
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_groups_parent ON product_groups(parent_id);
CREATE INDEX IF NOT EXISTS idx_product_groups_metal  ON product_groups(metal);

ALTER TABLE products ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES product_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_group ON products(group_id);
