-- Add permission_type to distinguish >2h permissions marked as half-day vs regular permission
ALTER TABLE permission_requests
  ADD COLUMN IF NOT EXISTS permission_type TEXT DEFAULT 'permission'
  CHECK (permission_type IN ('permission', 'half_day'));
