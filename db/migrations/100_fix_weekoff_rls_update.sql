-- Fix: staff UPDATE policy had no WITH CHECK, so Postgres defaulted to re-checking
-- USING (status IN ('draft','rejected')) on the NEW row — which blocks status -> 'pending'.
DROP POLICY IF EXISTS "own update draft" ON monthly_weekoffs;

CREATE POLICY "own update draft" ON monthly_weekoffs
  FOR UPDATE
  USING (auth.uid() = user_id AND status IN ('draft', 'rejected'))
  WITH CHECK (auth.uid() = user_id AND status IN ('draft', 'pending'));
