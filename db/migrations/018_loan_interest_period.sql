-- Add interest period to loans (daily / monthly / yearly)
ALTER TABLE loans ADD COLUMN IF NOT EXISTS interest_period text NOT NULL DEFAULT 'monthly';
