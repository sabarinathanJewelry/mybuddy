-- Add extra columns captured from ZK device and manual HR fields
ALTER TABLE staff ADD COLUMN IF NOT EXISTS device_uid    integer;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS privilege     smallint DEFAULT 0;   -- 0=user, 14=admin
ALTER TABLE staff ADD COLUMN IF NOT EXISTS card_no       bigint   DEFAULT 0;   -- RFID card number
ALTER TABLE staff ADD COLUMN IF NOT EXISTS group_id      text     DEFAULT '';
ALTER TABLE staff ADD COLUMN IF NOT EXISTS phone         text     DEFAULT '';
ALTER TABLE staff ADD COLUMN IF NOT EXISTS designation   text     DEFAULT '';
ALTER TABLE staff ADD COLUMN IF NOT EXISTS join_date     date;

-- Add punch_status to attendance_logs: 0=check-in, 1=check-out, 4=OT-in, 5=OT-out, 255=other
ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS punch_status smallint;
ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS punch_type   smallint;   -- 0=finger, 1=face, 2=card
