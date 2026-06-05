-- Add cut_rate to supplier payment mode enum
ALTER TYPE payment_mode ADD VALUE IF NOT EXISTS 'cut_rate';
