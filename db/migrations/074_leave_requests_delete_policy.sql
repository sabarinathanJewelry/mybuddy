-- 074: Allow admin to hard-delete leave requests
-- Previously only SELECT/INSERT/UPDATE were permitted; DELETE was blocked by RLS

CREATE POLICY "admin delete leave_requests" ON leave_requests
  FOR DELETE TO authenticated
  USING (coalesce(auth.jwt()->'app_metadata'->>'role','admin') != 'staff');
