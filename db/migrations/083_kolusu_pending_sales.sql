-- Staff-submitted kolusu sales (pending box assignment by admin)
-- source: 'form' (kolusu-sale page) or 'chat' (auto-detected from staff chat)

CREATE TABLE IF NOT EXISTS kolusu_pending_sales (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  tx_date     date NOT NULL,
  raw_wt_g    numeric(10,3) NOT NULL,
  cover_wt_g  numeric(10,3) NOT NULL DEFAULT 0,
  qty         integer NOT NULL DEFAULT 1,
  description text,
  bill_no     text,
  notes       text,
  staff_name  text,
  staff_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  box_id      uuid REFERENCES kolusu_boxes(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  source      text NOT NULL DEFAULT 'form'
);

ALTER TABLE kolusu_pending_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_kolusu_pending" ON kolusu_pending_sales
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
