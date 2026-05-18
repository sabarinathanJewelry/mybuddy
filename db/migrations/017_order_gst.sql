-- Add GST flag to orders (true = 3% GST on top of estimated total)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS gst_included boolean NOT NULL DEFAULT false;
