-- Add FK so PostgREST can resolve staff(name, designation) join in leave_requests queries
ALTER TABLE leave_requests
  ADD CONSTRAINT leave_requests_bio_user_id_fkey
  FOREIGN KEY (bio_user_id) REFERENCES staff(bio_user_id) ON DELETE CASCADE;
