-- RUN THIS IN SUPABASE SQL EDITOR FOR PROJECT oeugehqgpodzhagomeex
-- This drops all old get_leaderboard functions and creates a single clean version
-- with per-guild reset support.

-- 1. Drop ALL existing get_leaderboard functions
DROP FUNCTION IF EXISTS get_leaderboard(uuid, timestamptz) CASCADE;
DROP FUNCTION IF EXISTS get_leaderboard(uuid, timestamptz, jsonb) CASCADE;
DROP FUNCTION IF EXISTS get_leaderboard(uuid, timestamptz, timestamptz) CASCADE;
DROP FUNCTION IF EXISTS get_leaderboard(uuid, timestamptz, timestamptz, jsonb) CASCADE;
DROP FUNCTION IF EXISTS get_leaderboard(uuid, timestamptz, timestamptz, boolean) CASCADE;

-- 2. Add missing boss_guilds columns (if not already present)
ALTER TABLE public.boss_guilds ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT NULL;
ALTER TABLE public.boss_guilds ADD COLUMN IF NOT EXISTS has_salary BOOLEAN DEFAULT false;

-- 3. Fix snapshot period constraint to allow per-guild snapshots
ALTER TABLE public.leaderboard_snapshots 
  DROP CONSTRAINT IF EXISTS leaderboard_snapshots_period_check;
ALTER TABLE public.leaderboard_snapshots 
  ADD CONSTRAINT leaderboard_snapshots_period_check 
  CHECK (period IN ('all_time', 'weekly', 'monthly') OR period LIKE 'weekly:%');

-- 4. Create the single clean get_leaderboard function
CREATE OR REPLACE FUNCTION get_leaderboard(
  p_server_id uuid,
  p_since timestamptz DEFAULT NULL,
  p_until timestamptz DEFAULT NULL
)
RETURNS TABLE(
  member_id uuid,
  member_name text,
  boss_points bigint,
  activity_points bigint,
  total_points bigint,
  boss_kills bigint,
  activities_attended bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_guild_resets jsonb;
BEGIN
  -- Fetch all guild-specific reset dates for this server
  SELECT COALESCE(jsonb_object_agg(
    g.id::text,
    s.value
  ), '{}'::jsonb) INTO v_guild_resets
  FROM public.app_settings s
  JOIN public.guilds g ON g.server_id = s.server_id
    AND s.key = 'leaderboard_reset_at:' || g.name
  WHERE s.server_id = p_server_id;

  RETURN QUERY
  WITH boss_scores AS (
    SELECT
      m.id AS mid,
      m.name AS mname,
      COALESCE(SUM(COALESCE(bg.points, b.boss_points, 0)), 0) AS bp,
      COUNT(DISTINCT dr.id) AS bk
    FROM public.members m
    LEFT JOIN public.attendance_records ar ON ar.member_id = m.id
    LEFT JOIN public.death_records dr ON dr.id = ar.death_record_id
      AND dr.server_id = p_server_id
      AND (p_since IS NULL OR dr.death_time >= p_since)
      AND (p_until IS NULL OR dr.death_time <= p_until)
      -- Guild reset filter: apply ONLY when p_since is null (no global snapshot)
      AND (p_since IS NOT NULL OR ar.created_at >= COALESCE(
        (v_guild_resets->>m.guild_id::text)::timestamptz,
        '1970-01-01T00:00:00Z'::timestamptz
      ))
    LEFT JOIN public.bosses b ON b.id = dr.boss_id
    LEFT JOIN public.boss_guilds bg ON bg.boss_id = b.id AND bg.guild_id = m.guild_id
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
  ),
  point_adjustments AS (
    SELECT
      pa.member_id AS mid,
      COALESCE(SUM(pa.points), 0) AS adj_pts
    FROM public.point_adjustments pa
    LEFT JOIN public.members m ON m.id = pa.member_id
    WHERE pa.server_id = p_server_id
      AND (p_since IS NULL OR pa.created_at >= p_since)
      -- Apply same guild reset filter to point adjustments
      AND (p_since IS NOT NULL OR pa.created_at >= COALESCE(
        (v_guild_resets->>m.guild_id::text)::timestamptz,
        '1970-01-01T00:00:00Z'::timestamptz
      ))
    GROUP BY pa.member_id
  )
  SELECT
    bs.mid,
    bs.mname,
    bs.bp::bigint,
    COALESCE(ascores.ap, 0)::bigint,
    (bs.bp + COALESCE(ascores.ap, 0) + COALESCE(pa.adj_pts, 0))::bigint,
    bs.bk::bigint,
    COALESCE(ascores.aa_count, 0)::bigint
  FROM boss_scores bs
  LEFT JOIN activity_scores ascores ON ascores.mid = bs.mid
  LEFT JOIN point_adjustments pa ON pa.mid = bs.mid
  ORDER BY (bs.bp + COALESCE(ascores.ap, 0) + COALESCE(pa.adj_pts, 0)) DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION get_leaderboard(uuid, timestamptz, timestamptz) TO anon, authenticated;
