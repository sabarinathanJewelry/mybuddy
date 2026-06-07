-- Per-user flag: admin can grant/revoke access to the incentive self-service page
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS incentive_access BOOLEAN NOT NULL DEFAULT false;
