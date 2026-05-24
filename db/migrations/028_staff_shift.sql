-- 'boys' shift = 9:30–21:30, 'girls' shift = 9:30–20:30
ALTER TABLE staff ADD COLUMN IF NOT EXISTS shift text NOT NULL DEFAULT 'boys';
