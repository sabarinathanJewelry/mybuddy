-- Mark a sale as an exchange and link to the original bill
ALTER TABLE sales ADD COLUMN IF NOT EXISTS sale_type text NOT NULL DEFAULT 'fresh';
ALTER TABLE sales ADD COLUMN IF NOT EXISTS exchange_ref_bill text;
