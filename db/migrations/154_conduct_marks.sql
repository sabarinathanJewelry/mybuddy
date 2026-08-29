-- ── Behavior & Dressing marks (admin-recorded) ───────────────────────────────
-- Drop functions first so we can change their return types
DROP FUNCTION IF EXISTS calculate_monthly_rewards(text);
DROP FUNCTION IF EXISTS refresh_monthly_rewards(text);

CREATE TABLE IF NOT EXISTS staff_conduct_marks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  bio_user_id text        NOT NULL,
  month       text        NOT NULL, -- 'YYYY-MM'
  category    text        NOT NULL CHECK (category IN ('behavior', 'dressing')),
  points      integer     NOT NULL, -- positive = good, negative = bad
  note        text        NOT NULL,
  marked_by   text        NOT NULL,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE staff_conduct_marks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all read conduct_marks" ON staff_conduct_marks FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write conduct_marks" ON staff_conduct_marks FOR ALL TO authenticated
  USING (coalesce(auth.jwt()->'app_metadata'->>'role','admin') != 'staff')
  WITH CHECK (coalesce(auth.jwt()->'app_metadata'->>'role','admin') != 'staff');

-- ── Extend monthly_reward_scores with new columns ─────────────────────────────
ALTER TABLE monthly_reward_scores
  ADD COLUMN IF NOT EXISTS behavior_pts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dressing_pts integer NOT NULL DEFAULT 0;

-- Drop and recreate generated total_pts to include new categories
ALTER TABLE monthly_reward_scores DROP COLUMN IF EXISTS total_pts;
ALTER TABLE monthly_reward_scores
  ADD COLUMN total_pts integer GENERATED ALWAYS AS
    (punctuality_pts + leave_pts + break_pts + cleanliness_pts + behavior_pts + dressing_pts) STORED;

-- ── Update criteria ───────────────────────────────────────────────────────────
UPDATE reward_criteria SET max_pts = 40 WHERE category = 'punctuality';

INSERT INTO reward_criteria (category, label, max_pts, config) VALUES
  ('behavior', 'Behavior',          15, '{"min": -15, "max": 15, "presets": [5, 3, -3, -5, -10]}'),
  ('dressing', 'Dressing & Neatness', 15, '{"min": 0,   "max": 15, "presets": [5, 3, -3, -5]}')
ON CONFLICT (category) DO NOTHING;

-- ── Re-create calculation function ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION calculate_monthly_rewards(p_month text)
RETURNS TABLE(
  bio_user_id            text,
  staff_name             text,
  punctuality_pts        int,
  leave_pts              int,
  break_pts              int,
  cleanliness_pts        int,
  behavior_pts           int,
  dressing_pts           int,
  total_pts              int,
  on_time_days           int,
  leave_count            int,
  disciplined_break_days int,
  neat_pct               numeric
) LANGUAGE plpgsql AS $$
DECLARE
  v_month_start date := (p_month || '-01')::date;
  v_month_end   date := (date_trunc('month', (p_month || '-01')::date)
                          + interval '1 month - 1 day')::date;
  v_grace_mins  int  := 20;
  v_shift_start int  := 9 * 60 + 30;
  v_max_break   int  := 60;
BEGIN
  RETURN QUERY
  WITH

  daily_punches AS (
    SELECT
      al.bio_user_id,
      (al.punch_time AT TIME ZONE 'Asia/Kolkata')::date AS punch_date,
      array_agg(
        (al.punch_time AT TIME ZONE 'Asia/Kolkata')::time
        ORDER BY al.punch_time
      ) AS times,
      count(*)::int AS punch_count
    FROM attendance_logs al
    WHERE al.punch_time >= v_month_start
      AND al.punch_time <  v_month_end + interval '1 day'
    GROUP BY al.bio_user_id,
             (al.punch_time AT TIME ZONE 'Asia/Kolkata')::date
  ),

  punctuality AS (
    SELECT
      dp.bio_user_id,
      count(*) FILTER (
        WHERE extract(isodow from dp.punch_date) BETWEEN 1 AND 6
          AND (extract(hour from dp.times[1])::int * 60
               + extract(minute from dp.times[1])::int) <= v_shift_start + v_grace_mins
      )::int AS on_time_days
    FROM daily_punches dp
    GROUP BY dp.bio_user_id
  ),

  leaves AS (
    SELECT lr.bio_user_id, count(*)::int AS leave_count
    FROM leave_requests lr
    WHERE lr.status = 'approved'
      AND lr.leave_date >= v_month_start AND lr.leave_date <= v_month_end
    GROUP BY lr.bio_user_id
  ),

  break_days AS (
    SELECT
      dp.bio_user_id,
      count(*) FILTER (
        WHERE dp.punch_count >= 3
          AND extract(isodow from dp.punch_date) BETWEEN 1 AND 6
          AND (extract(epoch from (dp.times[3] - dp.times[2])) / 60) BETWEEN 1 AND v_max_break
      )::int AS disciplined_days
    FROM daily_punches dp
    GROUP BY dp.bio_user_id
  ),

  cleanliness AS (
    SELECT
      cc.checked_by AS bio_user_id,
      round(100.0 * count(*) FILTER (WHERE cc.is_neat) / nullif(count(*), 0), 2) AS neat_pct
    FROM cleanliness_checks cc
    WHERE cc.check_date >= v_month_start AND cc.check_date <= v_month_end
    GROUP BY cc.checked_by
  ),

  conduct AS (
    SELECT
      m.bio_user_id,
      greatest(-15, least(15, coalesce(sum(m.points) FILTER (WHERE m.category = 'behavior'), 0)))::int AS behavior_net,
      greatest(  0, least(15, coalesce(sum(m.points) FILTER (WHERE m.category = 'dressing'), 0)))::int AS dressing_net
    FROM staff_conduct_marks m
    WHERE m.month = p_month
    GROUP BY m.bio_user_id
  )

  SELECT
    s.bio_user_id,
    s.name                                                        AS staff_name,
    least(coalesce(p.on_time_days, 0), 40)                        AS punctuality_pts,
    CASE coalesce(l.leave_count, 0)
      WHEN 0 THEN 10 WHEN 1 THEN 8 WHEN 2 THEN 6 WHEN 3 THEN 4 ELSE 0
    END                                                           AS leave_pts,
    least(coalesce(b.disciplined_days, 0), 10)                    AS break_pts,
    CASE
      WHEN c.neat_pct IS NULL THEN 0
      WHEN c.neat_pct >= 90   THEN 10
      WHEN c.neat_pct >= 75   THEN 7
      WHEN c.neat_pct >= 60   THEN 4
      ELSE 0
    END                                                           AS cleanliness_pts,
    coalesce(co.behavior_net, 0)                                  AS behavior_pts,
    coalesce(co.dressing_net, 0)                                  AS dressing_pts,
    -- total
    least(coalesce(p.on_time_days, 0), 40) +
    CASE coalesce(l.leave_count, 0)
      WHEN 0 THEN 10 WHEN 1 THEN 8 WHEN 2 THEN 6 WHEN 3 THEN 4 ELSE 0
    END +
    least(coalesce(b.disciplined_days, 0), 10) +
    CASE
      WHEN c.neat_pct IS NULL THEN 0
      WHEN c.neat_pct >= 90   THEN 10
      WHEN c.neat_pct >= 75   THEN 7
      WHEN c.neat_pct >= 60   THEN 4
      ELSE 0
    END +
    coalesce(co.behavior_net, 0) +
    coalesce(co.dressing_net, 0)                                  AS total_pts,
    coalesce(p.on_time_days, 0)                                   AS on_time_days,
    coalesce(l.leave_count,  0)                                   AS leave_count,
    coalesce(b.disciplined_days, 0)                               AS disciplined_break_days,
    c.neat_pct

  FROM staff s
  LEFT JOIN punctuality  p  ON p.bio_user_id  = s.bio_user_id
  LEFT JOIN leaves        l  ON l.bio_user_id  = s.bio_user_id
  LEFT JOIN break_days    b  ON b.bio_user_id  = s.bio_user_id
  LEFT JOIN cleanliness   c  ON c.bio_user_id  = s.bio_user_id
  LEFT JOIN conduct       co ON co.bio_user_id = s.bio_user_id
  WHERE s.active = true
  ORDER BY total_pts DESC, s.name;
END;
$$;

-- ── Re-create refresh helper ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION refresh_monthly_rewards(p_month text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO monthly_reward_scores (
    bio_user_id, month,
    punctuality_pts, leave_pts, break_pts, cleanliness_pts,
    behavior_pts, dressing_pts,
    on_time_days, leave_count, disciplined_break_days, neat_pct,
    updated_at
  )
  SELECT
    r.bio_user_id, p_month,
    r.punctuality_pts, r.leave_pts, r.break_pts, r.cleanliness_pts,
    r.behavior_pts, r.dressing_pts,
    r.on_time_days, r.leave_count, r.disciplined_break_days, r.neat_pct,
    now()
  FROM calculate_monthly_rewards(p_month) r
  ON CONFLICT (bio_user_id, month) DO UPDATE SET
    punctuality_pts        = EXCLUDED.punctuality_pts,
    leave_pts              = EXCLUDED.leave_pts,
    break_pts              = EXCLUDED.break_pts,
    cleanliness_pts        = EXCLUDED.cleanliness_pts,
    behavior_pts           = EXCLUDED.behavior_pts,
    dressing_pts           = EXCLUDED.dressing_pts,
    on_time_days           = EXCLUDED.on_time_days,
    leave_count            = EXCLUDED.leave_count,
    disciplined_break_days = EXCLUDED.disciplined_break_days,
    neat_pct               = EXCLUDED.neat_pct,
    updated_at             = now();
END;
$$;
