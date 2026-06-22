-- Each admin / subadmin can have their own kiosk tap sequence
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS kiosk_sequence jsonb;
