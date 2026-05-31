-- Migration 046: Partner account tracking
-- Tracks payments received by partner/associate UPI or bank accounts on behalf of the shop

CREATE TABLE IF NOT EXISTS partner_accounts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  account_type text NOT NULL DEFAULT 'upi' CHECK (account_type IN ('upi', 'bank')),
  account_no   text,        -- UPI ID or account/phone number
  notes        text,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE partner_accounts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='partner_accounts' AND policyname='auth_all') THEN
    CREATE POLICY "auth_all" ON partner_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Settlements: when a partner transfers the collected money back to the shop
CREATE TABLE IF NOT EXISTS partner_settlements (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_account_id uuid NOT NULL REFERENCES partner_accounts(id) ON DELETE CASCADE,
  amount             numeric(14,2) NOT NULL,
  settled_date       date NOT NULL DEFAULT current_date,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE partner_settlements ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='partner_settlements' AND policyname='auth_all') THEN
    CREATE POLICY "auth_all" ON partner_settlements FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Track which partner account received a payment (nullable — NULL = shop's own account)
ALTER TABLE payments       ADD COLUMN IF NOT EXISTS partner_account_id uuid REFERENCES partner_accounts(id);
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS partner_account_id uuid REFERENCES partner_accounts(id);
ALTER TABLE sale_payments  ADD COLUMN IF NOT EXISTS partner_account_id uuid REFERENCES partner_accounts(id);
