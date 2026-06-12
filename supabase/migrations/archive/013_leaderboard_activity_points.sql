-- 013_leaderboard_activity_points: Extend get_leaderboard to include activity points
-- Players earn points from both boss kills and activity attendance.

CREATE OR REPLACE FUNCTION public.get_leaderboard(
  p_server_id UUID,
  p_since TIMESTAMPTZ DEFAULT NULL,
  p_until TIMESTAMPTZ DEFAULT NULL
) RETURNS TABLE(
  member_id UUID,
  member_name TEXT,
  boss_points BIGINT,
  activity_points BIGINT,
  total_points BIGINT,
  boss_kills BIGINT,
  activities_attended BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH boss_scores AS (
    SELECT
      m.id AS mid,
      m.name AS mname,
      COALESCE(SUM(b.boss_points), 0) AS bp,
      COUNT(DISTINCT dr.id) AS bk
    FROM public.members m
    LEFT JOIN public.attendance_records ar ON ar.member_id = m.id
    LEFT JOIN public.death_records dr ON dr.id = ar.death_record_id
      AND dr.server_id = p_server_id
      AND (p_since IS NULL OR dr.death_time >= p_since)
      AND (p_until IS NULL OR dr.death_time <= p_until)
    LEFT JOIN public.bosses b ON b.id = dr.boss_id
    WHERE m.server_id = p_server_id
    GROUP BY m.id, m.name
  ),
  activity_scores AS (
    SELECT
      m.id AS mid,
      COALESCE(SUM(a.points_per_participant), 0) AS ap,
      COUNT(DISTINCT aa.activity_instance_id) AS aa_count
    FROM public.members m
    LEFT JOIN public.activity_attendance aa ON aa.member_id = m.id AND aa.present = true
    LEFT JOIN public.activity_instances ai ON ai.id = aa.activity_instance_id
      AND (p_since IS NULL OR ai.end_time >= p_since)
      AND (p_until IS NULL OR ai.end_time <= p_until)
    LEFT JOIN public.activities a ON a.id = ai.activity_id AND a.server_id = p_server_id
    WHERE m.server_id = p_server_id
    GROUP BY m.id
  )
  SELECT
    bs.mid,
    bs.mname,
    bs.bp,
    COALESCE(ascores.ap, 0),
    bs.bp + COALESCE(ascores.ap, 0),
    bs.bk,
    COALESCE(ascores.aa_count, 0)
  FROM boss_scores bs
  LEFT JOIN activity_scores ascores ON ascores.mid = bs.mid
  ORDER BY bs.bp + COALESCE(ascores.ap, 0) DESC;
END;
$$;
