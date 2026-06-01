-- Migration 050: Repair storage policies + payment tracking

-- ── Storage policies for repair-photos bucket ──────────────────────────────
-- "CREATE POLICY IF NOT EXISTS" is not valid syntax — use DO blocks.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'auth all repair-photos'
  ) THEN
    CREATE POLICY "auth all repair-photos"
      ON storage.objects FOR ALL TO authenticated
      USING (bucket_id = 'repair-photos')
      WITH CHECK (bucket_id = 'repair-photos');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'public read repair-photos'
  ) THEN
    CREATE POLICY "public read repair-photos"
      ON storage.objects FOR SELECT USING (bucket_id = 'repair-photos');
  END IF;
END $$;

-- ── Payment tracking on repairs ────────────────────────────────────────────
ALTER TABLE repairs
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
  ADD COLUMN IF NOT EXISTS paid_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_mode      TEXT CHECK (paid_mode IN ('cash', 'upi', 'bank')),
  ADD COLUMN IF NOT EXISTS paid_at        TIMESTAMPTZ;
