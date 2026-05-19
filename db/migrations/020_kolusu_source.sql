-- Track which kolusu_transactions came from a sale (for cleanup on edit/delete)
ALTER TABLE kolusu_transactions ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'manual';
ALTER TABLE kolusu_transactions ADD COLUMN IF NOT EXISTS source_id uuid;
