-- 088: Staff task management
CREATE TABLE IF NOT EXISTS staff_tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  description   TEXT,
  assigned_to   TEXT NOT NULL REFERENCES staff(bio_user_id) ON DELETE CASCADE,
  created_by    TEXT NOT NULL,   -- bio_user_id of admin/subadmin who created it
  due_date      DATE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  completed_at  TIMESTAMPTZ,
  completed_note TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE staff_tasks ENABLE ROW LEVEL SECURITY;

-- Staff can read their own assigned tasks; admin/subadmin can read all
CREATE POLICY "tasks_select" ON staff_tasks
  FOR SELECT TO authenticated
  USING (
    assigned_to = (SELECT bio_user_id FROM staff WHERE user_id = auth.uid() LIMIT 1)
    OR coalesce(auth.jwt()->'app_metadata'->>'role', 'admin') != 'staff'
  );

-- Only admin/subadmin can create tasks
CREATE POLICY "tasks_insert" ON staff_tasks
  FOR INSERT TO authenticated
  WITH CHECK (coalesce(auth.jwt()->'app_metadata'->>'role', 'admin') != 'staff');

-- Staff can update their own task (mark complete); admin can update any
CREATE POLICY "tasks_update" ON staff_tasks
  FOR UPDATE TO authenticated
  USING (
    assigned_to = (SELECT bio_user_id FROM staff WHERE user_id = auth.uid() LIMIT 1)
    OR coalesce(auth.jwt()->'app_metadata'->>'role', 'admin') != 'staff'
  )
  WITH CHECK (true);

-- Only admin/subadmin can delete tasks
CREATE POLICY "tasks_delete" ON staff_tasks
  FOR DELETE TO authenticated
  USING (coalesce(auth.jwt()->'app_metadata'->>'role', 'admin') != 'staff');
