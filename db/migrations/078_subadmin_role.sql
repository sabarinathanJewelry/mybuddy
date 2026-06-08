-- 078: Sub-admin role — limited ERP access with per-module permissions
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'subadmin';

-- Stores which ERP modules this user can access (route slugs, e.g. ["sales","customers"])
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS allowed_modules JSONB NOT NULL DEFAULT '[]'::jsonb;
