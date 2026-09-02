-- 157: Punctuality attendance bonus
--
-- Base: 1 pt per on-time day (arrived by 9:50 AM)
-- Bonus on top:
--   >= 27 on-time days → +10 bonus  (exceptional attendance)
--   21-26 on-time days → +5  bonus  (very good attendance)
--   18-19 on-time days → +3  bonus  (good attendance)
--   <= 17 on-time days → no bonus
-- Total punctuality capped at 40.

DROP FUNCTION IF EXISTS calculate_monthly_rewards(text);
DROP FUNCTION IF EXISTS refresh_monthly_rewards(text);

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
  neat_pct               numeric,
  leave_flag             boolean
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
        (al.punch_time AT TIME ZONE 'Asia/Kolkata')::time ORDER BY al.punch_time
      ) AS times,
      count(*)::int AS punch_count
    FROM attendance_logs al
    WHERE al.punch_time >= v_month_start
      AND al.punch_time <  v_month_end + interval '1 day'
    GROUP BY al.bio_user_id, (al.punch_time AT TIME ZONE 'Asia/Kolkata')::date
  ),

  punctuality AS (
    SELECT dp.bio_user_id,
      count(*) FILTER (
        WHERE extract(isodow from dp.punch_date) BETWEEN 1 AND 6
          AND (extract(hour from dp.times[1])::int * 60
               + extract(minute from dp.times[1])::int) <= v_shift_start + v_grace_mins
      )::int AS on_time_days
    FROM daily_punches dp GROUP BY dp.bio_user_id
  ),

  leaves AS (
    SELECT
      lr.bio_user_id,
      count(*) FILTER (WHERE lr.status IN ('approved', 'pending'))::int AS leave_count,
      max(
        CASE
          WHEN (lr.created_at AT TIME ZONE 'Asia/Kolkata')::date = lr.leave_date THEN 2
          WHEN (lr.created_at AT TIME ZONE 'Asia/Kolkata')::date > lr.leave_date  THEN 1
          ELSE 0
        END
      ) FILTER (WHERE lr.status IN ('approved', 'pending')) AS worst_timing
    FROM leave_requests lr
    WHERE lr.leave_date >= v_month_start AND lr.leave_date <= v_month_end
    GROUP BY lr.bio_user_id
  ),

  break_days AS (
    SELECT dp.bio_user_id,
      count(*) FILTER (
        WHERE dp.punch_count >= 3
          AND extract(isodow from dp.punch_date) BETWEEN 1 AND 6
          AND (extract(epoch from (dp.times[3] - dp.times[2])) / 60) BETWEEN 1 AND v_max_break
      )::int AS disciplined_days
    FROM daily_punches dp GROUP BY dp.bio_user_id
  ),

  cleanliness AS (
    SELECT cc.checked_by AS bio_user_id,
      round(100.0 * count(*) FILTER (WHERE cc.is_neat) / nullif(count(*), 0), 2) AS neat_pct
    FROM cleanliness_checks cc
    WHERE cc.check_date >= v_month_start AND cc.check_date <= v_month_end
    GROUP BY cc.checked_by
  ),

  manual_marks AS (
    SELECT m.bio_user_id,
      coalesce(sum(m.points) FILTER (WHERE m.category = 'behavior'), 0)::int AS manual_behavior,
      coalesce(sum(m.points) FILTER (WHERE m.category = 'dressing'), 0)::int AS manual_dressing
    FROM staff_conduct_marks m
    WHERE m.month = p_month
    GROUP BY m.bio_user_id
  ),

  conduct_deductions AS (
    SELECT s.bio_user_id,
      coalesce(sum(
        CASE cn.status WHEN 'fined' THEN -5 WHEN 'pending' THEN -2 ELSE 0 END
      ) FILTER (WHERE coalesce(cc.name,'') NOT IN ('Dress Code','Grooming')), 0)::int AS behavior_deduct,
      coalesce(sum(
        CASE cn.status WHEN 'fined' THEN -5 WHEN 'pending' THEN -2 ELSE 0 END
      ) FILTER (WHERE coalesce(cc.name,'') IN ('Dress Code','Grooming')), 0)::int AS dressing_deduct
    FROM staff s
    JOIN conduct_notes cn ON cn.staff_id = s.id
    LEFT JOIN conduct_categories cc ON cc.id = cn.category_id
    WHERE cn.note_date >= v_month_start AND cn.note_date <= v_month_end
    GROUP BY s.bio_user_id
  )

  SELECT
    s.bio_user_id,
    s.name AS staff_name,

    -- Punctuality: 1 pt per on-time day + attendance bonus, capped at 40
    least(40,
      coalesce(p.on_time_days, 0) +
      CASE
        WHEN coalesce(p.on_time_days, 0) >= 27 THEN 10
        WHEN coalesce(p.on_time_days, 0) > 20  THEN 5
        WHEN coalesce(p.on_time_days, 0) > 17  THEN 3
        ELSE 0
      END
    ) AS punctuality_pts,

    CASE
      WHEN coalesce(l.worst_timing, 0) = 2 THEN 5
      WHEN coalesce(l.worst_timing, 0) = 1 THEN 8
      ELSE 10
    END AS leave_pts,

    least(coalesce(b.disciplined_days, 0), 10) AS break_pts,

    CASE
      WHEN cl.neat_pct IS NULL THEN 0
      WHEN cl.neat_pct >= 90   THEN 10
      WHEN cl.neat_pct >= 75   THEN 7
      WHEN cl.neat_pct >= 60   THEN 4
      ELSE 0
    END AS cleanliness_pts,

    greatest(-15, least(15,
      coalesce(mm.manual_behavior, 0) + coalesce(cd.behavior_deduct, 0)
    )) AS behavior_pts,

    greatest(0, least(15,
      15 + coalesce(mm.manual_dressing, 0) + coalesce(cd.dressing_deduct, 0)
    )) AS dressing_pts,

    -- Total (punctuality already includes bonus)
    least(40,
      coalesce(p.on_time_days, 0) +
      CASE
        WHEN coalesce(p.on_time_days, 0) >= 27 THEN 10
        WHEN coalesce(p.on_time_days, 0) > 20  THEN 5
        WHEN coalesce(p.on_time_days, 0) > 17  THEN 3
        ELSE 0
      END
    ) +
    CASE
      WHEN coalesce(l.worst_timing, 0) = 2 THEN 5
      WHEN coalesce(l.worst_timing, 0) = 1 THEN 8
      ELSE 10
    END +
    least(coalesce(b.disciplined_days, 0), 10) +
    CASE
      WHEN cl.neat_pct IS NULL THEN 0
      WHEN cl.neat_pct >= 90   THEN 10
      WHEN cl.neat_pct >= 75   THEN 7
      WHEN cl.neat_pct >= 60   THEN 4
      ELSE 0
    END +
    greatest(-15, least(15, coalesce(mm.manual_behavior, 0) + coalesce(cd.behavior_deduct, 0))) +
    greatest(0,   least(15, 15 + coalesce(mm.manual_dressing, 0) + coalesce(cd.dressing_deduct, 0)))
    AS total_pts,

    coalesce(p.on_time_days,     0) AS on_time_days,
    coalesce(l.leave_count,      0) AS leave_count,
    coalesce(b.disciplined_days, 0) AS disciplined_break_days,
    cl.neat_pct,

    coalesce(l.leave_count, 0) > 3 AS leave_flag

  FROM staff s
  LEFT JOIN punctuality        p  ON p.bio_user_id  = s.bio_user_id
  LEFT JOIN leaves             l  ON l.bio_user_id  = s.bio_user_id
  LEFT JOIN break_days         b  ON b.bio_user_id  = s.bio_user_id
  LEFT JOIN cleanliness        cl ON cl.bio_user_id = s.bio_user_id
  LEFT JOIN manual_marks       mm ON mm.bio_user_id = s.bio_user_id
  LEFT JOIN conduct_deductions cd ON cd.bio_user_id = s.bio_user_id
  WHERE s.active = true
  ORDER BY total_pts DESC, s.name;
END;
$$;

CREATE OR REPLACE FUNCTION refresh_monthly_rewards(p_month text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO monthly_reward_scores (
    bio_user_id, month,
    punctuality_pts, leave_pts, break_pts, cleanliness_pts,
    behavior_pts, dressing_pts,
    on_time_days, leave_count, disciplined_break_days, neat_pct,
    leave_flag,
    updated_at
  )
  SELECT
    r.bio_user_id, p_month,
    r.punctuality_pts, r.leave_pts, r.break_pts, r.cleanliness_pts,
    r.behavior_pts, r.dressing_pts,
    r.on_time_days, r.leave_count, r.disciplined_break_days, r.neat_pct,
    r.leave_flag,
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
    leave_flag             = EXCLUDED.leave_flag,
    updated_at             = now();
END;
$$;
