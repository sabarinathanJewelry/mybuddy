-- Migration 044: Repair Management System

CREATE TABLE IF NOT EXISTS repairs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_no           text NOT NULL UNIQUE,
  customer_name       text NOT NULL,
  customer_phone      text,
  item_description    text NOT NULL,
  item_weight_in      numeric(10,3),
  in_date             date NOT NULL DEFAULT current_date,
  estimated_out_date  date,
  repair_details      text,
  estimated_charge    numeric(14,2),
  status              text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'sent_to_aasari', 'got_back', 'delivered')),
  photo_url           text,
  assigned_to         text,   -- bio_user_id of responsible staff
  received_by         text,   -- bio_user_id of staff who took it in
  delivery_weight     numeric(10,3),
  final_amount        numeric(14,2),
  payment_mode        text CHECK (payment_mode IN ('cash', 'upi', 'bank')),
  delivered_at        date,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE repairs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='repairs' AND policyname='auth_all'
  ) THEN
    CREATE POLICY "auth_all" ON repairs FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- repair_access per user (admin controls which staff can see repairs)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS repair_access boolean NOT NULL DEFAULT false;

-- NOTE: Create a Supabase Storage bucket named 'repair-photos' (public)
-- Dashboard → Storage → New bucket → Name: repair-photos → Public: ON
