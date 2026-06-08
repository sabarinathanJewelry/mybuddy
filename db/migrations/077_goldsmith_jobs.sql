-- 077: Goldsmith Jobs — track full lifecycle of job work
-- sent → received → sold
CREATE TABLE IF NOT EXISTS goldsmith_jobs (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_no           TEXT UNIQUE NOT NULL,
  goldsmith_name   TEXT NOT NULL,
  item_description TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'sent'
                   CHECK (status IN ('sent', 'received', 'sold')),

  -- Send stage
  sent_date        DATE NOT NULL,
  sent_purity      TEXT NOT NULL DEFAULT 'gold_24k',
  sent_grams       NUMERIC(10, 3) NOT NULL,

  -- Receive stage
  received_date    DATE,
  received_purity  TEXT,
  received_grams   NUMERIC(10, 3),

  -- Charges (die charge, wastage, making, etc.)
  charges_amount   NUMERIC(12, 2) NOT NULL DEFAULT 0,
  charges_notes    TEXT,

  -- Sale stage
  sale_amount      NUMERIC(12, 2),
  sale_date        DATE,

  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE goldsmith_jobs ENABLE ROW LEVEL SECURITY;

-- Admin-only: no staff access
CREATE POLICY "admin_all" ON goldsmith_jobs
  FOR ALL TO authenticated
  USING  (coalesce(auth.jwt()->'app_metadata'->>'role', 'admin') != 'staff')
  WITH CHECK (coalesce(auth.jwt()->'app_metadata'->>'role', 'admin') != 'staff');
