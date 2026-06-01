-- Migration 050: Repair storage policies + payment tracking

-- ── Storage policies for repair-photos bucket ──────────────────────────────
-- The bucket exists but has 0 policies → authenticated users can't upload.
-- Run this to allow all authenticated users to upload/read/delete.

CREATE POLICY IF NOT EXISTS "auth all repair-photos"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'repair-photos')
  WITH CHECK (bucket_id = 'repair-photos');

-- Public anonymous read (so the img src URLs work without auth tokens)
CREATE POLICY IF NOT EXISTS "public read repair-photos"
  ON storage.objects FOR SELECT USING (bucket_id = 'repair-photos');

-- ── Payment tracking on repairs ────────────────────────────────────────────
ALTER TABLE repairs
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
  ADD COLUMN IF NOT EXISTS paid_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_mode      TEXT CHECK (paid_mode IN ('cash', 'upi', 'bank')),
  ADD COLUMN IF NOT EXISTS paid_at        TIMESTAMPTZ;
