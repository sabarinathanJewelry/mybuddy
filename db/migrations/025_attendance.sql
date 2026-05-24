-- Staff / employees registered on the biometric device
CREATE TABLE IF NOT EXISTS staff (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bio_user_id  text UNIQUE NOT NULL,
  name         text NOT NULL,
  department   text NOT NULL DEFAULT '',
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz DEFAULT now()
);

-- Attendance punches synced from biometric device
CREATE TABLE IF NOT EXISTS attendance_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bio_user_id  text NOT NULL,
  punch_time   timestamptz NOT NULL,
  synced_at    timestamptz DEFAULT now(),
  CONSTRAINT attendance_logs_unique UNIQUE (bio_user_id, punch_time)
);

CREATE INDEX IF NOT EXISTS idx_attendance_logs_time ON attendance_logs (punch_time DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_user ON attendance_logs (bio_user_id, punch_time);
