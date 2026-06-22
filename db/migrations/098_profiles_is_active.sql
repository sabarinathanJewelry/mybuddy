-- Migration 098: Add is_active flag to profiles for staff termination
-- Deactivated users are signed out and cannot log back in.
-- Run in Supabase SQL Editor

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
