-- 071: SOP (Standard Operating Procedures) documents
CREATE TABLE IF NOT EXISTS sop_documents (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT        NOT NULL,
  category    TEXT        NOT NULL DEFAULT 'general',
  content     TEXT        NOT NULL DEFAULT '',
  sort_order  INT         NOT NULL DEFAULT 0,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sop_documents ENABLE ROW LEVEL SECURITY;

-- Staff (all authenticated) can read active SOPs
CREATE POLICY "staff_read_sop" ON sop_documents
  FOR SELECT TO authenticated
  USING (is_active = true);

-- Admin can do everything (including inactive)
CREATE POLICY "admin_all_sop" ON sop_documents
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- Seed common categories with placeholder content
INSERT INTO sop_documents (title, category, sort_order, content) VALUES
  ('Shop Opening Procedure',   'shop_opening', 1,  'Edit this content to add your shop opening SOP.'),
  ('Shop Closing Procedure',   'shop_closing', 2,  'Edit this content to add your shop closing SOP.'),
  ('Sales Process',            'sales',        3,  'Edit this content to add your sales process SOP.'),
  ('Exchange Policy',          'exchange',     4,  'Edit this content to add your exchange policy.'),
  ('Return Policy',            'return',       5,  'Edit this content to add your return policy.'),
  ('General Staff Guidelines', 'general',      6,  'Edit this content to add general staff guidelines.');
