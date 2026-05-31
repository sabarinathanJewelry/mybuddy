-- Migration 045: Add signature_url to repairs
ALTER TABLE repairs ADD COLUMN IF NOT EXISTS signature_url text;
