-- Allow authenticated users full access to staff and attendance tables
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all" ON staff FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all" ON attendance_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
