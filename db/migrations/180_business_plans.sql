-- 180: Yearly goals and action plan (moved from the planning Google Sheet)

CREATE TABLE IF NOT EXISTS business_plans (
  id          uuid primary key default gen_random_uuid(),
  fy          text not null,
  kind        text not null check (kind in ('goal', 'action')),
  title       text not null,
  value       text,
  done        boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS business_plans_fy_idx ON business_plans(fy);

ALTER TABLE business_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_business_plans" ON business_plans FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

INSERT INTO business_plans (fy, kind, title, value, sort_order)
SELECT * FROM (VALUES
  ('2025-26', 'goal',   'Gold (Sales Plan)',          '65 kg',     1),
  ('2025-26', 'goal',   'Silver (Sales Plan)',        '160 kg',    2),
  ('2025-26', 'goal',   'Silver MRP (Sales Plan)',    '₹50 L',     3),
  ('2025-26', 'goal',   'Gold (summary sheet)',       '80,000 g',  4),
  ('2025-26', 'goal',   'Silver (summary sheet)',     '1,50,000 g', 5),
  ('2025-26', 'goal',   'Silver MRP (summary sheet)', '₹40 L',     6),
  ('2025-26', 'action', 'Plan to take cost % data', null, 1),
  ('2025-26', 'action', 'Plan to do more branding with social media', null, 2),
  ('2025-26', 'action', 'Sale of Old Shop, to reduce gold debt with supplier', null, 3),
  ('2025-26', 'action', 'Bring customers of all religions, to balance the dull months', null, 4)
) AS v(fy, kind, title, value, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM business_plans WHERE fy = '2025-26');
