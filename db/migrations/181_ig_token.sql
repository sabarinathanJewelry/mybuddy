-- Instagram long-lived token, auto-refreshed weekly by /api/cron/instagram-token.
-- RLS on with no policies: service role only.
CREATE TABLE IF NOT EXISTS ig_token (
  id           INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  access_token TEXT NOT NULL,
  expires_at   TIMESTAMPTZ,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error   TEXT
);
ALTER TABLE ig_token ENABLE ROW LEVEL SECURITY;
