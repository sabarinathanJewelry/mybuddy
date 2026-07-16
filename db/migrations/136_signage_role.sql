-- 136: New restricted role — logs in and can only reach /admin/signage/* (playlists,
-- channels, devices), nothing else in the ERP. Enforced in middleware.ts, not just
-- UI hiding. Same pattern as 078_subadmin_role.sql adding 'subadmin'.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'signage';
