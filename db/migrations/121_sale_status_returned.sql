-- Add 'returned' value to the sale_status enum
ALTER TYPE sale_status ADD VALUE IF NOT EXISTS 'returned';
