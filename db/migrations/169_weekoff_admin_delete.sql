-- 169: Allow admins to delete any weekoff record (required for Revoke All + single-day revoke that empties dates)
-- Without this policy, RLS silently blocked all DELETEs with no error returned.

CREATE POLICY "admin delete weekoffs" ON monthly_weekoffs
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
