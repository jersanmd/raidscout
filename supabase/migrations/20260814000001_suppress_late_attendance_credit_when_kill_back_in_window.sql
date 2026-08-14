-- Stop a late-attendance credit from double-counting when the kill it compensates
-- for comes back into the scoring window.
--
-- 20260814000000 mints a point_adjustment when attendance is added for a kill older
-- than the guild's reset. That assumes the reset only ever moves forward -- but
-- delete_leaderboard_snapshot moves it BACKWARD, to the previous snapshot's
-- finalized_at, or removes it entirely when no earlier snapshot exists. Staff
-- deleting a mis-timed finalize and redoing it is a normal action.
--
-- Once the cutoff moves back past the kill, the kill scores directly again AND the
-- adjustment still counts, so the member is paid twice. On SVEN 1 that would be
-- 1,768 points handed out a second time across 36 players.
--
-- Fix: an adjustment tied to an attendance row only counts while that row's kill is
-- OUTSIDE the requested window. This is self-correcting in both directions -- move
-- the cutoff back and the credit steps aside for the real kill; move it forward
-- again and the credit returns. It also means the credit is correctly absent from
-- any snapshot whose period contains the original kill.
--
-- Unlinked adjustments (attendance_record_id IS NULL) are ordinary manual staff
-- adjustments and are unaffected.
--
-- Everything else is unchanged from 20260808000000.

CREATE OR REPLACE FUNCTION public.get_leaderboard(
  p_server_id uuid,
  p_since timestamp with time zone DEFAULT NULL,
  p_until timestamp with time zone DEFAULT NULL
)
RETURNS TABLE(member_id uuid, member_name text, boss_points bigint, activity_points bigint,
              total_points bigint, boss_kills bigint, activities_attended bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_guild_resets jsonb;
  v_tz text;
  v_server_created_at timestamptz;
BEGIN
  SELECT COALESCE(s.timezone, 'UTC'), s.created_at INTO v_tz, v_server_created_at FROM public.servers s WHERE s.id = p_server_id;

  SELECT COALESCE(jsonb_object_agg(g.id::text, s.value), '{}'::jsonb) INTO v_guild_resets
  FROM public.app_settings s
  JOIN public.guilds g ON g.server_id = s.server_id AND s.key = 'leaderboard_reset_at:' || g.name
  WHERE s.server_id = p_server_id;

  RETURN QUERY
  WITH boss_scores AS (
    SELECT m.id AS mid, m.name AS mname,
      COALESCE(SUM(COALESCE(bg.points, b.boss_points, 0) * COALESCE(
        (SELECT MAX((pr.config->>'multiplier')::numeric) FROM public.point_rules pr
         WHERE pr.guild_id = m.guild_id AND pr.rule_type = 'time_multiplier' AND pr.enabled = true
         AND (((pr.config->>'start_hour')::int <= (pr.config->>'end_hour')::int
               AND EXTRACT(HOUR FROM dr.death_time AT TIME ZONE v_tz) >= (pr.config->>'start_hour')::int
               AND EXTRACT(HOUR FROM dr.death_time AT TIME ZONE v_tz) < (pr.config->>'end_hour')::int)
              OR ((pr.config->>'start_hour')::int > (pr.config->>'end_hour')::int
                  AND (EXTRACT(HOUR FROM dr.death_time AT TIME ZONE v_tz) >= (pr.config->>'start_hour')::int
                       OR EXTRACT(HOUR FROM dr.death_time AT TIME ZONE v_tz) < (pr.config->>'end_hour')::int)))), 1)), 0) AS bp,
      COUNT(DISTINCT dr.id) AS bk
    FROM public.members m
    LEFT JOIN public.attendance_records ar ON ar.member_id = m.id
    LEFT JOIN public.death_records dr ON dr.id = ar.death_record_id
      AND dr.server_id = p_server_id
      AND dr.death_time >= COALESCE(p_since, (v_guild_resets->>m.guild_id::text)::timestamptz,
        v_server_created_at, '2025-01-01T00:00:00Z'::timestamptz)
      AND (p_until IS NULL OR dr.death_time <= p_until)
    LEFT JOIN public.bosses b ON b.id = dr.boss_id
    LEFT JOIN (SELECT DISTINCT ON (boss_id, guild_id) boss_id, guild_id, points FROM public.boss_guilds WHERE points IS NOT NULL ORDER BY boss_id, guild_id, points DESC) bg ON bg.boss_id = b.id AND bg.guild_id = m.guild_id
    WHERE m.server_id = p_server_id GROUP BY m.id, m.name
  ),
  activity_scores AS (
    SELECT m.id AS mid,
      COALESCE(SUM(COALESCE(ag.points, a.points_per_participant, 0) * COALESCE(
        (SELECT MAX((pr.config->>'multiplier')::numeric) FROM public.point_rules pr
         WHERE pr.guild_id = m.guild_id AND pr.rule_type = 'time_multiplier' AND pr.enabled = true
         AND (((pr.config->>'start_hour')::int <= (pr.config->>'end_hour')::int
               AND EXTRACT(HOUR FROM ai.end_time AT TIME ZONE v_tz) >= (pr.config->>'start_hour')::int
               AND EXTRACT(HOUR FROM ai.end_time AT TIME ZONE v_tz) < (pr.config->>'end_hour')::int)
              OR ((pr.config->>'start_hour')::int > (pr.config->>'end_hour')::int
                  AND (EXTRACT(HOUR FROM ai.end_time AT TIME ZONE v_tz) >= (pr.config->>'start_hour')::int
                       OR EXTRACT(HOUR FROM ai.end_time AT TIME ZONE v_tz) < (pr.config->>'end_hour')::int)))), 1)), 0) AS ap,
      COUNT(DISTINCT aa.activity_instance_id) AS aa_count
    FROM public.members m
    LEFT JOIN public.activity_attendance aa ON aa.member_id = m.id AND aa.present = true
    LEFT JOIN public.activity_instances ai ON ai.id = aa.activity_instance_id
      AND ai.end_time >= COALESCE(p_since, (v_guild_resets->>m.guild_id::text)::timestamptz,
        v_server_created_at, '2025-01-01T00:00:00Z'::timestamptz)
      AND (p_until IS NULL OR ai.end_time <= p_until)
    LEFT JOIN public.activities a ON a.id = ai.activity_id AND a.server_id = p_server_id
    LEFT JOIN (SELECT DISTINCT ON (activity_id, guild_id) activity_id, guild_id, points FROM public.activity_guilds WHERE points IS NOT NULL ORDER BY activity_id, guild_id, points DESC) ag ON ag.activity_id = a.id AND ag.guild_id = m.guild_id
    WHERE m.server_id = p_server_id GROUP BY m.id
  ),
  point_adjustments AS (
    SELECT pa.member_id AS mid, COALESCE(SUM(pa.points), 0) AS adj_pts
    FROM public.point_adjustments pa
    LEFT JOIN public.members m ON m.id = pa.member_id
    WHERE pa.server_id = p_server_id
      AND pa.created_at >= COALESCE(p_since, (v_guild_resets->>m.guild_id::text)::timestamptz,
        v_server_created_at, '2025-01-01T00:00:00Z'::timestamptz)
      AND (p_until IS NULL OR pa.created_at <= p_until)
      -- A late-attendance credit stands down whenever its own kill is back inside
      -- the window and scoring on its own account.
      AND (pa.attendance_record_id IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.attendance_records ar2
        JOIN public.death_records dr2 ON dr2.id = ar2.death_record_id
        WHERE ar2.id = pa.attendance_record_id
          AND dr2.server_id = p_server_id
          AND dr2.death_time >= COALESCE(p_since, (v_guild_resets->>m.guild_id::text)::timestamptz,
            v_server_created_at, '2025-01-01T00:00:00Z'::timestamptz)
          AND (p_until IS NULL OR dr2.death_time <= p_until)
      ))
    GROUP BY pa.member_id
  )
  SELECT bs.mid, bs.mname, bs.bp::bigint, COALESCE(ascores.ap, 0)::bigint,
    (bs.bp + COALESCE(ascores.ap, 0) + COALESCE(pa.adj_pts, 0))::bigint, bs.bk::bigint, COALESCE(ascores.aa_count, 0)::bigint
  FROM boss_scores bs LEFT JOIN activity_scores ascores ON ascores.mid = bs.mid LEFT JOIN point_adjustments pa ON pa.mid = bs.mid
  ORDER BY (bs.bp + COALESCE(ascores.ap, 0) + COALESCE(pa.adj_pts, 0)) DESC;
END;
$function$;

-- Trigger functions return `trigger` so PostgREST will not expose them, but the
-- ALTER DEFAULT PRIVILEGES grant still lands on newly created functions. Strip it
-- for consistency with the other hardened RPCs.
REVOKE EXECUTE ON FUNCTION public.credit_late_attendance() FROM PUBLIC, anon;
