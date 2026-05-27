CREATE TABLE IF NOT EXISTS products (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT    NOT NULL,
  metal               TEXT    NOT NULL DEFAULT 'gold_22k',
  default_purity_pct  NUMERIC(6,3),
  default_va_pct      NUMERIC(6,3)  DEFAULT 0,
  default_making_amt  NUMERIC(12,2) DEFAULT 0,
  active              BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_metal ON products (metal, active);
