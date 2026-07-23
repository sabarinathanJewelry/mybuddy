-- 142: Photo Shoot Tracker
-- Tracks showcase items taken out for photography and returned, with pipeline planning

CREATE TABLE photo_sections (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO photo_sections (name, sort_order) VALUES
  ('Antique Haram',  1),
  ('Gold Haram',     2),
  ('Necklace',       3),
  ('Bangles',        4),
  ('Earrings',       5),
  ('Chains',         6),
  ('Rings',          7),
  ('Pendant',        8),
  ('Other',          99);

CREATE TABLE photo_shoot_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_id          TEXT NOT NULL,
  product_name    TEXT,
  section_id      BIGINT REFERENCES photo_sections(id),
  shoot_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  status          TEXT NOT NULL DEFAULT 'planned'
                  CHECK (status IN ('planned','out','returned','skipped')),
  checked_out_at  TIMESTAMPTZ,
  checked_in_at   TIMESTAMPTZ,
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON photo_shoot_log (shoot_date);
CREATE INDEX ON photo_shoot_log (status);

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS photo_shoot_access BOOLEAN NOT NULL DEFAULT FALSE;

-- RLS
ALTER TABLE photo_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_shoot_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sections_read" ON photo_sections FOR SELECT TO authenticated USING (true);
CREATE POLICY "sections_write" ON photo_sections FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','subadmin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','subadmin')));

CREATE POLICY "log_read" ON photo_shoot_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "log_insert" ON photo_shoot_log FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "log_update" ON photo_shoot_log FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','subadmin'))
  );
CREATE POLICY "log_delete" ON photo_shoot_log FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','subadmin')));
