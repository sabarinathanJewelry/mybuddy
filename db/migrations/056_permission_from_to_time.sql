-- Migration 056: Permission requests — add from_time / to_time, allow future dates
-- Staff can now pick a time range; late_minutes is computed from the difference.
-- Relax the 120-minute cap since a from→to range can span more.

ALTER TABLE permission_requests ADD COLUMN IF NOT EXISTS from_time time;
ALTER TABLE permission_requests ADD COLUMN IF NOT EXISTS to_time   time;

-- Drop the old 1-120 check and replace with just > 0
ALTER TABLE permission_requests DROP CONSTRAINT IF EXISTS permission_requests_late_minutes_check;
ALTER TABLE permission_requests ADD  CONSTRAINT permission_requests_late_minutes_check CHECK (late_minutes > 0);
