-- 090: Allow staff to create their own tasks (self-assigned)
DROP POLICY IF EXISTS "tasks_insert" ON staff_tasks;

CREATE POLICY "tasks_insert" ON staff_tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Admin/subadmin can assign to anyone
    coalesce(auth.jwt()->'app_metadata'->>'role', 'admin') != 'staff'
    OR
    -- Staff can only create tasks assigned to themselves
    assigned_to = (SELECT bio_user_id FROM staff WHERE user_id = auth.uid() LIMIT 1)
  );
