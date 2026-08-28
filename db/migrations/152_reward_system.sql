-- ── Reward System ────────────────────────────────────────────────────────────
-- Computes monthly reward points per staff from existing attendance data.
-- Categories: punctuality, leave discipline, break discipline, cleanliness.

-- Configurable scoring rules (admin can update values without code changes)
CREATE TABLE IF NOT EXISTS reward_criteria (
  id      serial PRIMARY KEY,
  category text  NOT NULL UNIQUE,
  label    text  NOT NULL,
  max_pts  integer NOT NULL,
  config   jsonb NOT NULL DEFAULT '{}'
);

INSERT INTO reward_criteria (category, label, max_pts, config) VALUES
  ('punctuality', 'Punctuality',       25, '{"grace_minutes": 5, "shift_start": "09:30"}'),
  ('leave',       'Leave Discipline',  10, '{"0": 10, "1": 8, "2": 6, "3": 4, "4+": 0}'),
  ('break',       'Break Discipline',  10, '{"max_break_minutes": 60}'),
  ('cleanliness', 'Cleanliness',       15, '{"supervisor_only": true, "90pct": 15, "75pct": 10, "60pct": 5}')
ON CONFLICT (category) DO NOTHING;

-- Pre-computed monthly scores (refreshed on demand by admin)
CREATE TABLE IF NOT EXISTS monthly_reward_scores (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bio_user_id      text    NOT NULL,
  month            text    NOT NULL, -- 'YYYY-MM'
  punctuality_pts  integer NOT NULL DEFAULT 0,
  leave_pts        integer NOT NULL DEFAULT 0,
  break_pts        integer NOT NULL DEFAULT 0,
  cleanliness_pts  integer NOT NULL DEFAULT 0,
  total_pts        integer GENERATED ALWAYS AS
                     (punctuality_pts + leave_pts + break_pts + cleanliness_pts) STORED,
  on_time_days     integer NOT NULL DEFAULT 0,
  leave_count      integer NOT NULL DEFAULT 0,
  disciplined_break_days integer NOT NULL DEFAULT 0,
  neat_pct         numeric(5,2),
  updated_at       timestamptz DEFAULT now(),
  UNIQUE(bio_user_id, month)
);

ALTER TABLE monthly_reward_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all read reward_scores"   ON monthly_reward_scores FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write reward_scores" ON monthly_reward_scores FOR ALL TO authenticated
  USING (coalesce(auth.jwt()->'app_metadata'->>'role','admin') != 'staff')
  WITH CHECK (coalesce(auth.jwt()->'app_metadata'->>'role','admin') != 'staff');

ALTER TABLE reward_criteria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all read reward_criteria"    ON reward_criteria FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write reward_criteria" ON reward_criteria FOR ALL TO authenticated
  USING (coalesce(auth.jwt()->'app_metadata'->>'role','admin') != 'staff')
  WITH CHECK (coalesce(auth.jwt()->'app_metadata'->>'role','admin') != 'staff');

-- ── Core calculation function ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION calculate_monthly_rewards(p_month text)
RETURNS TABLE(
  bio_user_id          text,
  staff_name           text,
  punctuality_pts      int,
  leave_pts            int,
  break_pts            int,
  cleanliness_pts      int,
  total_pts            int,
  on_time_days         int,
  leave_count          int,
  disciplined_break_days int,
  neat_pct             numeric
) LANGUAGE plpgsql AS $$
DECLARE
  v_month_start date := (p_month || '-01')::date;
  v_month_end   date := (date_trunc('month', (p_month || '-01')::date)
                          + interval '1 month - 1 day')::date;
  v_grace_mins  int  := 5;    -- minutes after 9:30 still counts as on-time
  v_shift_start int  := 9 * 60 + 30;   -- 09:30 in minutes
  v_max_break   int  := 60;   -- max acceptable lunch break in minutes
BEGIN
  RETURN QUERY
  WITH

  -- ── Punches grouped by IST date ──────────────────────────────────────────
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

  -- ── Punctuality: first punch of day within grace period ──────────────────
  punctuality AS (
    SELECT
      dp.bio_user_id,
      count(*) FILTER (
        WHERE
          extract(isodow from dp.punch_date) BETWEEN 1 AND 6
          AND (
            extract(hour  from dp.times[1])::int * 60
            + extract(minute from dp.times[1])::int
          ) <= v_shift_start + v_grace_mins
      )::int AS on_time_days
    FROM daily_punches dp
    GROUP BY dp.bio_user_id
  ),

  -- ── Leave count for the month ─────────────────────────────────────────────
  leaves AS (
    SELECT
      lr.bio_user_id,
      count(*)::int AS leave_count
    FROM leave_requests lr
    WHERE lr.status    = 'approved'
      AND lr.leave_date >= v_month_start
      AND lr.leave_date <= v_month_end
    GROUP BY lr.bio_user_id
  ),

  -- ── Break discipline: 2nd→3rd punch gap is the lunch break ───────────────
  break_days AS (
    SELECT
      dp.bio_user_id,
      count(*) FILTER (
        WHERE
          dp.punch_count >= 3
          AND extract(isodow from dp.punch_date) BETWEEN 1 AND 6
          AND (
            extract(epoch from (dp.times[3] - dp.times[2])) / 60
          ) BETWEEN 1 AND v_max_break  -- had a break, but within allowed window
      )::int AS disciplined_days
    FROM daily_punches dp
    GROUP BY dp.bio_user_id
  ),

  -- ── Cleanliness: neat % for the month (supervisor metric) ─────────────────
  cleanliness AS (
    SELECT
      cc.checked_by AS bio_user_id,
      round(
        100.0 * count(*) FILTER (WHERE cc.is_neat) / nullif(count(*), 0),
        2
      ) AS neat_pct
    FROM cleanliness_checks cc
    WHERE cc.check_date >= v_month_start
      AND cc.check_date <= v_month_end
    GROUP BY cc.checked_by
  )

  SELECT
    s.bio_user_id,
    s.name                                                       AS staff_name,

    -- Punctuality pts (max 25)
    least(coalesce(p.on_time_days, 0), 25)                       AS punctuality_pts,

    -- Leave pts
    CASE coalesce(l.leave_count, 0)
      WHEN 0 THEN 10
      WHEN 1 THEN 8
      WHEN 2 THEN 6
      WHEN 3 THEN 4
      ELSE 0
    END                                                          AS leave_pts,

    -- Break pts (max 10)
    least(coalesce(b.disciplined_days, 0), 10)                   AS break_pts,

    -- Cleanliness pts
    CASE
      WHEN c.neat_pct IS NULL        THEN 0
      WHEN c.neat_pct >= 90          THEN 15
      WHEN c.neat_pct >= 75          THEN 10
      WHEN c.neat_pct >= 60          THEN 5
      ELSE                                0
    END                                                          AS cleanliness_pts,

    -- Total
    least(coalesce(p.on_time_days, 0), 25) +
    CASE coalesce(l.leave_count, 0)
      WHEN 0 THEN 10 WHEN 1 THEN 8 WHEN 2 THEN 6 WHEN 3 THEN 4 ELSE 0
    END +
    least(coalesce(b.disciplined_days, 0), 10) +
    CASE
      WHEN c.neat_pct IS NULL THEN 0
      WHEN c.neat_pct >= 90   THEN 15
      WHEN c.neat_pct >= 75   THEN 10
      WHEN c.neat_pct >= 60   THEN 5
      ELSE 0
    END                                                          AS total_pts,

    coalesce(p.on_time_days,      0)                             AS on_time_days,
    coalesce(l.leave_count,       0)                             AS leave_count,
    coalesce(b.disciplined_days,  0)                             AS disciplined_break_days,
    c.neat_pct

  FROM staff s
  LEFT JOIN punctuality  p ON p.bio_user_id = s.bio_user_id
  LEFT JOIN leaves        l ON l.bio_user_id = s.bio_user_id
  LEFT JOIN break_days    b ON b.bio_user_id = s.bio_user_id
  LEFT JOIN cleanliness   c ON c.bio_user_id = s.bio_user_id
  WHERE s.active = true
  ORDER BY total_pts DESC, s.name;
END;
$$;

-- ── Upsert helper called from the UI ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION refresh_monthly_rewards(p_month text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO monthly_reward_scores (
    bio_user_id, month,
    punctuality_pts, leave_pts, break_pts, cleanliness_pts,
    on_time_days, leave_count, disciplined_break_days, neat_pct,
    updated_at
  )
  SELECT
    r.bio_user_id, p_month,
    r.punctuality_pts, r.leave_pts, r.break_pts, r.cleanliness_pts,
    r.on_time_days, r.leave_count, r.disciplined_break_days, r.neat_pct,
    now()
  FROM calculate_monthly_rewards(p_month) r
  ON CONFLICT (bio_user_id, month) DO UPDATE SET
    punctuality_pts        = EXCLUDED.punctuality_pts,
    leave_pts              = EXCLUDED.leave_pts,
    break_pts              = EXCLUDED.break_pts,
    cleanliness_pts        = EXCLUDED.cleanliness_pts,
    on_time_days           = EXCLUDED.on_time_days,
    leave_count            = EXCLUDED.leave_count,
    disciplined_break_days = EXCLUDED.disciplined_break_days,
    neat_pct               = EXCLUDED.neat_pct,
    updated_at             = now();
END;
$$;
