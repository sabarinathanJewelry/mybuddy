-- Link conduct_notes to the reward calculation.
-- Dress Code / Grooming notes → dressing_pts deductions
-- Customer Handling / Punctuality / Other notes → behavior_pts deductions
-- fined = -5 pts, pending = -2 pts, dismissed = 0

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
    SELECT lr.bio_user_id, count(*)::int AS leave_count
    FROM leave_requests lr
    WHERE lr.status = 'approved'
      AND lr.leave_date >= v_month_start AND lr.leave_date <= v_month_end
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

  -- Manual reward marks (admin-entered directly in Rewards tab)
  manual_marks AS (
    SELECT m.bio_user_id,
      coalesce(sum(m.points) FILTER (WHERE m.category = 'behavior'), 0)::int AS manual_behavior,
      coalesce(sum(m.points) FILTER (WHERE m.category = 'dressing'), 0)::int AS manual_dressing
    FROM staff_conduct_marks m
    WHERE m.month = p_month
    GROUP BY m.bio_user_id
  ),

  -- Deductions from the conduct_notes system (Staff Conduct page)
  -- Dress Code / Grooming → dressing, everything else → behavior
  conduct_deductions AS (
    SELECT s.bio_user_id,
      coalesce(sum(
        CASE cn.status
          WHEN 'fined'   THEN -5
          WHEN 'pending' THEN -2
          ELSE 0
        END
      ) FILTER (WHERE coalesce(cc.name,'') NOT IN ('Dress Code','Grooming')), 0)::int AS behavior_deduct,
      coalesce(sum(
        CASE cn.status
          WHEN 'fined'   THEN -5
          WHEN 'pending' THEN -2
          ELSE 0
        END
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

    least(coalesce(p.on_time_days, 0), 40) AS punctuality_pts,

    CASE coalesce(l.leave_count, 0)
      WHEN 0 THEN 10 WHEN 1 THEN 8 WHEN 2 THEN 6 WHEN 3 THEN 4 ELSE 0
    END AS leave_pts,

    least(coalesce(b.disciplined_days, 0), 10) AS break_pts,

    CASE
      WHEN cl.neat_pct IS NULL THEN 0
      WHEN cl.neat_pct >= 90   THEN 10
      WHEN cl.neat_pct >= 75   THEN 7
      WHEN cl.neat_pct >= 60   THEN 4
      ELSE 0
    END AS cleanliness_pts,

    -- Behavior: manual marks + conduct note deductions, capped [-15, +15]
    greatest(-15, least(15,
      coalesce(mm.manual_behavior, 0) + coalesce(cd.behavior_deduct, 0)
    )) AS behavior_pts,

    -- Dressing: starts at 15, deducted by dress-code conduct notes + manual marks, floor 0
    greatest(0, least(15,
      15 + coalesce(mm.manual_dressing, 0) + coalesce(cd.dressing_deduct, 0)
    )) AS dressing_pts,

    -- Total
    least(coalesce(p.on_time_days, 0), 40) +
    CASE coalesce(l.leave_count, 0)
      WHEN 0 THEN 10 WHEN 1 THEN 8 WHEN 2 THEN 6 WHEN 3 THEN 4 ELSE 0
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
    cl.neat_pct

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
