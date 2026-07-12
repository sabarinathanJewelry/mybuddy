ALTER TABLE whatsapp_leads
  ADD COLUMN IF NOT EXISTS category TEXT
    CHECK (category IN ('gold','silver','diamond','repair','reel','walkin','general','other')),
  ADD COLUMN IF NOT EXISTS source TEXT;
