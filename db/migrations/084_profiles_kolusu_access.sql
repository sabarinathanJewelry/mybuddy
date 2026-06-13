-- Add kolusu_access flag to profiles (like repair_access / incentive_access)
-- Allows specific staff to log kolusu sales via chat keyword KS

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS kolusu_access boolean NOT NULL DEFAULT false;
