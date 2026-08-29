-- Update punctuality grace period to 20 min (arrive by 9:50 = on time)
UPDATE reward_criteria
SET config = '{"grace_minutes": 20, "shift_start": "09:30"}'
WHERE category = 'punctuality';

-- Re-create calculation function with updated threshold
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
  v_grace_mins  int  := 20;   -- arrive by 9:50 = on time
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

  -- Punctuality: arrived by 9:50 (shift 9:30 + 20 min grace)
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

  -- Leave: count approved leaves this month
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

  -- Break: 2nd→3rd punch gap is the lunch break
  break_days AS (
    SELECT
      dp.bio_user_id,
      count(*) FILTER (
        WHERE
          dp.punch_count >= 3
          AND extract(isodow from dp.punch_date) BETWEEN 1 AND 6
          AND (
            extract(epoch from (dp.times[3] - dp.times[2])) / 60
          ) BETWEEN 1 AND v_max_break
      )::int AS disciplined_days
    FROM daily_punches dp
    GROUP BY dp.bio_user_id
  ),

  -- Cleanliness: neat % for supervisor
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
    least(coalesce(p.on_time_days, 0), 25)                       AS punctuality_pts,
    CASE coalesce(l.leave_count, 0)
      WHEN 0 THEN 10
      WHEN 1 THEN 8
      WHEN 2 THEN 6
      WHEN 3 THEN 4
      ELSE 0
    END                                                          AS leave_pts,
    least(coalesce(b.disciplined_days, 0), 10)                   AS break_pts,
    CASE
      WHEN c.neat_pct IS NULL        THEN 0
      WHEN c.neat_pct >= 90          THEN 15
      WHEN c.neat_pct >= 75          THEN 10
      WHEN c.neat_pct >= 60          THEN 5
      ELSE                                0
    END                                                          AS cleanliness_pts,
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
