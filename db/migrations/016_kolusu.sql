-- Kolusu (silver anklet) inventory: boxes + sale transactions

CREATE TABLE IF NOT EXISTS kolusu_boxes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_no            text NOT NULL,
  color             text NOT NULL DEFAULT '',
  size              text NOT NULL DEFAULT '',
  box_tare_g        numeric(10,3) NOT NULL DEFAULT 0,
  initial_gross_wt_g numeric(10,3) NOT NULL DEFAULT 0,
  current_gross_wt_g numeric(10,3) NOT NULL DEFAULT 0,
  initial_qty       integer NOT NULL DEFAULT 0,
  current_qty       integer NOT NULL DEFAULT 0,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kolusu_transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_date       date NOT NULL,
  box_id        uuid NOT NULL REFERENCES kolusu_boxes(id) ON DELETE CASCADE,
  qty_change    integer NOT NULL,         -- negative for sales (e.g. -5)
  raw_wt_g      numeric(10,3) NOT NULL DEFAULT 0,  -- weight from bill
  cover_wt_g    numeric(10,3) NOT NULL DEFAULT 0,  -- cover/packaging weight
  total_wt_g    numeric(10,3) NOT NULL DEFAULT 0,  -- raw + cover (deducted from box)
  bill_no       text,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE kolusu_boxes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE kolusu_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_kolusu_boxes"  ON kolusu_boxes        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_kolusu_txns"   ON kolusu_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
