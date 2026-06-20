-- 095: Monthly week-off planning — staff pick 3 days, admin approves
CREATE TABLE IF NOT EXISTS monthly_weekoffs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month        TEXT NOT NULL,          -- 'YYYY-MM'
  dates        DATE[] NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'pending', 'approved', 'rejected')),
  submitted_at TIMESTAMPTZ,
  reviewed_by  UUID REFERENCES auth.users(id),
  reviewed_at  TIMESTAMPTZ,
  review_note  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, month)
);

ALTER TABLE monthly_weekoffs ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read all weekoffs (team visibility)
CREATE POLICY "all can read weekoffs" ON monthly_weekoffs
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Staff can insert/update their own only when draft or pending
CREATE POLICY "own draft weekoffs" ON monthly_weekoffs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own update draft" ON monthly_weekoffs
  FOR UPDATE USING (auth.uid() = user_id AND status IN ('draft', 'rejected'));

-- Service role (admin actions via Edge Function) or direct admin update handled via service role
CREATE INDEX IF NOT EXISTS idx_weekoffs_user_month ON monthly_weekoffs(user_id, month);
CREATE INDEX IF NOT EXISTS idx_weekoffs_month ON monthly_weekoffs(month);
CREATE INDEX IF NOT EXISTS idx_weekoffs_status ON monthly_weekoffs(status);
