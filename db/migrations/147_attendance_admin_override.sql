-- Admin punch overrides: soft-delete instead of hard-delete so the sync
-- upsert (which conflicts on bio_user_id,punch_time) cannot re-insert a
-- record that admin deliberately removed or replaced.
ALTER TABLE attendance_logs
  ADD COLUMN IF NOT EXISTS deleted_by_admin boolean NOT NULL DEFAULT false;
