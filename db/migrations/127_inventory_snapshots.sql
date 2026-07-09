-- Period-end inventory snapshots for P&L V2 inventory movement tracking
-- One row per metal ('gold' | 'silver') per snapshot date (typically start-of-month)
CREATE TABLE IF NOT EXISTS metal_inventory_snapshots (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE         NOT NULL,
  metal         TEXT         NOT NULL CHECK (metal IN ('gold', 'silver')),
  pure_wt       NUMERIC(12,4) NOT NULL DEFAULT 0,
  wac_rate      NUMERIC(12,4) NOT NULL DEFAULT 0,
  notes         TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_snapshot
  ON metal_inventory_snapshots (snapshot_date, metal);
