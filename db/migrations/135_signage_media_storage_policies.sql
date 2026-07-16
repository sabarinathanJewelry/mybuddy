-- 135: Storage policies for signage-media bucket — same pattern as 050_repair_payments.sql
-- for repair-photos. A "Public" bucket only grants public SELECT; uploads (INSERT)
-- still need an explicit RLS policy on storage.objects, which migration 133 missed.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'auth all signage-media'
  ) THEN
    CREATE POLICY "auth all signage-media"
      ON storage.objects FOR ALL TO authenticated
      USING (bucket_id = 'signage-media')
      WITH CHECK (bucket_id = 'signage-media');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'public read signage-media'
  ) THEN
    CREATE POLICY "public read signage-media"
      ON storage.objects FOR SELECT USING (bucket_id = 'signage-media');
  END IF;
END $$;
