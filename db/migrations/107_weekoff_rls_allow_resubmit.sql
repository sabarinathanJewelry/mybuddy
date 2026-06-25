-- Allow staff to update their own approved weekoff (to request more days).
-- Previous policy only allowed draft/rejected → blocked "Request More Days" on approved records.
DROP POLICY IF EXISTS "own update draft" ON monthly_weekoffs;

CREATE POLICY "own update weekoff" ON monthly_weekoffs
  FOR UPDATE
  USING (auth.uid() = user_id AND status IN ('draft', 'rejected', 'approved'))
  WITH CHECK (auth.uid() = user_id AND status IN ('draft', 'pending'));
