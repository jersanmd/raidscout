-- From 004_helper_functions.sql
-- 004_helper_functions.sql
-- Helper functions for the app

-- Resolve a user ID from their email (for moderator invites)
create or replace function get_user_id_by_email(user_email text)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select id from auth.users where email = user_email limit 1;
$$;

-- Grant execute to authenticated users
grant execute on function get_user_id_by_email(text) to authenticated;


-- From 007_create_server_with_bosses.sql
-- 006_create_server_with_bosses.sql
-- RPC that creates a new server and seeds all 39 bosses in a transaction.
-- Previously existed only in the database; now tracked here for source control.

CREATE OR REPLACE FUNCTION create_server_with_bosses(server_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  srv_id UUID;
  invite TEXT;
BEGIN
  invite := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));
  
  INSERT INTO public.servers (name, owner_id, invite_code)
  VALUES (server_name, auth.uid(), invite)
  RETURNING id INTO srv_id;

  INSERT INTO public.server_members (server_id, user_id, role)
  VALUES (srv_id, auth.uid(), 'owner');

  -- Seed 39 default bosses (22 fixed_hours + 17 fixed_schedule)
  INSERT INTO public.bosses (server_id, name, spawn_type, respawn_hours, schedule)
  VALUES 
    (srv_id, 'Amentis', 'fixed_hours', 29, NULL),
    (srv_id, 'Araneo', 'fixed_hours', 24, NULL),
    (srv_id, 'Asta', 'fixed_hours', 62, NULL),
    (srv_id, 'Baron', 'fixed_hours', 32, NULL),
    (srv_id, 'Catena', 'fixed_hours', 35, NULL),
    (srv_id, 'Duplican', 'fixed_hours', 48, NULL),
    (srv_id, 'Ego', 'fixed_hours', 21, NULL),
    (srv_id, 'Gareth', 'fixed_hours', 32, NULL),
    (srv_id, 'General Aquleus', 'fixed_hours', 29, NULL),
    (srv_id, 'Lady Dalia', 'fixed_hours', 18, NULL),
    (srv_id, 'Larba', 'fixed_hours', 35, NULL),
    (srv_id, 'Livera', 'fixed_hours', 24, NULL),
    (srv_id, 'Metus', 'fixed_hours', 48, NULL),
    (srv_id, 'Ordo', 'fixed_hours', 62, NULL),
    (srv_id, 'Secreta', 'fixed_hours', 62, NULL),
    (srv_id, 'Shuliar', 'fixed_hours', 35, NULL),
    (srv_id, 'Supore', 'fixed_hours', 62, NULL),
    (srv_id, 'Titore', 'fixed_hours', 37, NULL),
    (srv_id, 'Undomiel', 'fixed_hours', 24, NULL),
    (srv_id, 'Venatus', 'fixed_hours', 10, NULL),
    (srv_id, 'Viorent', 'fixed_hours', 10, NULL),
    (srv_id, 'Wannitas', 'fixed_hours', 48, NULL),
    (srv_id, 'Auraq', 'fixed_schedule', NULL, '[{"day":5,"time":"22:00"},{"day":3,"time":"21:00"}]'::jsonb),
    (srv_id, 'Benji', 'fixed_schedule', NULL, '[{"day":0,"time":"21:00"}]'::jsonb),
    (srv_id, 'Chaiflock', 'fixed_schedule', NULL, '[{"day":0,"time":"15:00"}]'::jsonb),
    (srv_id, 'Clemantis', 'fixed_schedule', NULL, '[{"day":1,"time":"11:30"},{"day":4,"time":"19:00"}]'::jsonb),
    (srv_id, 'Icaruthia', 'fixed_schedule', NULL, '[{"day":2,"time":"21:00"},{"day":5,"time":"21:00"}]'::jsonb),
    (srv_id, 'Libitina', 'fixed_schedule', NULL, '[{"day":1,"time":"21:00"},{"day":6,"time":"21:00"}]'::jsonb),
    (srv_id, 'Lucus', 'fixed_schedule', NULL, '[{"day":6,"time":"22:00"}]'::jsonb),
    (srv_id, 'Milavy', 'fixed_schedule', NULL, '[{"day":6,"time":"15:00"}]'::jsonb),
    (srv_id, 'Motti', 'fixed_schedule', NULL, '[{"day":3,"time":"19:00"},{"day":6,"time":"19:00"}]'::jsonb),
    (srv_id, 'Neutro', 'fixed_schedule', NULL, '[{"day":2,"time":"19:00"},{"day":4,"time":"11:30"}]'::jsonb),
    (srv_id, 'Nevaeh', 'fixed_schedule', NULL, '[{"day":0,"time":"22:00"}]'::jsonb),
    (srv_id, 'Rakajeth', 'fixed_schedule', NULL, '[{"day":2,"time":"22:00"},{"day":0,"time":"19:00"}]'::jsonb),
    (srv_id, 'Ringor', 'fixed_schedule', NULL, '[{"day":6,"time":"17:00"}]'::jsonb),
    (srv_id, 'Roderick', 'fixed_schedule', NULL, '[{"day":5,"time":"19:00"}]'::jsonb),
    (srv_id, 'Saphirus', 'fixed_schedule', NULL, '[{"day":0,"time":"17:00"},{"day":2,"time":"11:30"}]'::jsonb),
    (srv_id, 'Thymele', 'fixed_schedule', NULL, '[{"day":1,"time":"19:00"},{"day":3,"time":"11:30"}]'::jsonb),
    (srv_id, 'Tumier', 'fixed_schedule', NULL, '[{"day":0,"time":"19:00"}]'::jsonb)
  ;

  RETURN jsonb_build_object('id', srv_id, 'name', server_name, 'invite_code', invite);
END;
$$;

GRANT EXECUTE ON FUNCTION create_server_with_bosses(text) TO authenticated;


-- From 008_get_server_stats_with_guilds.sql
-- 008_get_server_stats_with_guilds.sql
-- Updates get_server_stats to include guild member breakdown and total raid members.

CREATE OR REPLACE FUNCTION get_server_stats(p_server_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  SELECT jsonb_build_object(
    'member_count', (SELECT COUNT(*) FROM public.server_members WHERE server_id = p_server_id),
    'boss_count', (SELECT COUNT(*) FROM public.bosses WHERE server_id = p_server_id),
    'death_count', (SELECT COUNT(*) FROM public.death_records WHERE server_id = p_server_id),
    'has_webhook', (SELECT discord_webhook_url IS NOT NULL AND discord_webhook_url != '' FROM public.servers WHERE id = p_server_id),
    'guild_members', (
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT COALESCE(g.name, 'No Guild') AS guild, COUNT(m.id) AS count
        FROM public.guilds g
        LEFT JOIN public.members m ON m.guild_id = g.id AND m.server_id = p_server_id
        WHERE g.server_id = p_server_id
        GROUP BY g.name
        UNION ALL
        SELECT 'No Guild', COUNT(*) FROM public.members 
        WHERE server_id = p_server_id AND guild_id IS NULL
        ORDER BY guild
      ) t
    ),
    'total_raid_members', (SELECT COUNT(*) FROM public.members WHERE server_id = p_server_id)
  ) INTO result;

  RETURN result;
END;
$$;


-- From 012_update_create_server_rpc.sql
-- 012_update_create_server_rpc: Rewrite create_server_with_bosses for multi-game
-- Accepts game_id + seed flag + guild_name. Also sets game slug column.

CREATE OR REPLACE FUNCTION public.create_server_with_bosses(
  p_name TEXT,
  p_game_id UUID,
  p_seed BOOLEAN DEFAULT true,
  p_guild_name TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_server_id UUID;
  v_user_id UUID;
  v_count INTEGER;
  v_guild_id UUID;
  v_guild_count INTEGER;
BEGIN
  v_user_id := auth.uid();

  INSERT INTO public.servers (name, owner_id, game_id, game)
  VALUES (p_name, v_user_id, p_game_id, (SELECT slug FROM public.games WHERE id = p_game_id))
  RETURNING id INTO v_server_id;

  INSERT INTO public.server_members (server_id, user_id, role)
  VALUES (v_server_id, v_user_id, 'owner');

  IF p_guild_name IS NOT NULL AND p_guild_name != '' THEN
    INSERT INTO public.guilds (name, server_id)
    VALUES (p_guild_name, v_server_id);
  END IF;

  IF p_seed THEN
    INSERT INTO public.bosses (server_id, template_id, name, spawn_type, respawn_hours, schedule, is_enabled, is_custom, boss_points, points)
    SELECT v_server_id, bt.id, bt.name, bt.spawn_type, bt.respawn_hours, bt.schedule, true, false, COALESCE(bt.points, 1), COALESCE(bt.points, 1)
    FROM public.boss_templates bt
    WHERE bt.game_id = p_game_id OR p_game_id IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    IF v_count = 0 THEN
      PERFORM public.seed_bosses_for_server(v_server_id);
    END IF;

    INSERT INTO public.activities (server_id, template_id, name, schedule_type, schedule, duration_minutes, points_per_participant, party_size, is_enabled, is_custom)
    SELECT v_server_id, at.id, at.name, at.schedule_type, at.schedule, at.duration_minutes, at.points_per_participant, at.party_size, true, false
    FROM public.activity_templates at
    WHERE at.game_id = p_game_id OR p_game_id IS NULL;
  END IF;

  SELECT COUNT(*) INTO v_guild_count FROM public.guilds WHERE server_id = v_server_id;
  IF v_guild_count = 1 THEN
    SELECT id INTO v_guild_id FROM public.guilds WHERE server_id = v_server_id LIMIT 1;

    INSERT INTO public.boss_guilds (boss_id, guild_id, sort_order, mode)
    SELECT b.id, v_guild_id, 1, 'rotation'
    FROM public.bosses b
    WHERE b.server_id = v_server_id
    ON CONFLICT DO NOTHING;

    INSERT INTO public.activity_guilds (activity_id, guild_id, sort_order, mode)
    SELECT a.id, v_guild_id, 1, 'rotation'
    FROM public.activities a
    WHERE a.server_id = v_server_id
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_server_id;
END;
$$;


-- From 013_leaderboard_activity_points.sql
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


-- From 015_activity_parties_rpc.sql
-- 015_activity_parties_rpc: Functions for managing activity parties

CREATE OR REPLACE FUNCTION public.set_activity_parties(
  p_activity_instance_id UUID,
  p_parties JSONB -- [{party_number: 1, member_ids: [uuid, ...]}, ...]
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete existing parties for this instance
  DELETE FROM public.activity_parties WHERE activity_instance_id = p_activity_instance_id;
  
  -- Insert new parties
  FOR i IN 0..jsonb_array_length(p_parties) - 1 LOOP
    INSERT INTO public.activity_parties (activity_instance_id, party_number, member_ids)
    VALUES (
      p_activity_instance_id,
      (p_parties->i->>'party_number')::INTEGER,
      (SELECT array_agg(v::UUID) FROM jsonb_array_elements_text(p_parties->i->'member_ids') v)
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_activity_attendance(
  p_activity_instance_id UUID,
  p_member_id UUID,
  p_present BOOLEAN DEFAULT true
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.activity_attendance (activity_instance_id, member_id, present)
  VALUES (p_activity_instance_id, p_member_id, p_present)
  ON CONFLICT (activity_instance_id, member_id)
  DO UPDATE SET present = EXCLUDED.present;
END;
$$;


-- From 017_find_daily_slot.sql
-- 017_find_daily_slot: Helper function for daily-recurring activities

CREATE OR REPLACE FUNCTION public.find_next_daily_slot(
  p_last_time TIMESTAMPTZ,
  p_time_str TEXT -- "HH:MM"
) RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  hh INTEGER;
  mm INTEGER;
  result TIMESTAMPTZ;
BEGIN
  hh := split_part(p_time_str, ':', 1)::INTEGER;
  mm := split_part(p_time_str, ':', 2)::INTEGER;
  
  -- Next day at the specified time
  result := date_trunc('day', p_last_time) + INTERVAL '1 day' + (hh || ' hours')::INTERVAL + (mm || ' minutes')::INTERVAL;
  
  RETURN result;
END;
$$;


-- From 038_fix_leaderboard_per_guild.sql
-- 038_fix_leaderboard_per_guild.sql
-- Single clean get_leaderboard with per-guild point overrides + per-guild reset support

-- 1. Drop ALL existing get_leaderboard function overloads
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
AS $$
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
      AND (p_since IS NOT NULL OR ar.created_at >= COALESCE(
        (v_guild_resets->>m.guild_id::text)::timestamptz,
        '1970-01-01T00:00:00Z'::timestamptz
      ))
    LEFT JOIN public.bosses b ON b.id = dr.boss_id
    LEFT JOIN (
      SELECT DISTINCT ON (boss_id, guild_id) boss_id, guild_id, points
      FROM public.boss_guilds
      WHERE points IS NOT NULL
      ORDER BY boss_id, guild_id, points DESC
    ) bg ON bg.boss_id = b.id AND bg.guild_id = m.guild_id
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
$$;

GRANT EXECUTE ON FUNCTION get_leaderboard(uuid, timestamptz, timestamptz) TO anon, authenticated;


-- From 039_add_time_multiplier_to_rpc.sql
-- 039_add_time_multiplier_to_rpc.sql
-- Add time-based multiplier support to get_leaderboard RPC

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
AS $$
DECLARE
  v_guild_resets jsonb;
  v_tz text;
BEGIN
  -- Get server timezone
  SELECT COALESCE(s.timezone, 'UTC') INTO v_tz FROM public.servers s WHERE s.id = p_server_id;

  -- Fetch all guild-specific reset dates
  SELECT COALESCE(jsonb_object_agg(
    g.id::text, s.value
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
      COALESCE(SUM(
        COALESCE(bg.points, b.boss_points, 0) * COALESCE(
          (SELECT MAX((pr.config->>'multiplier')::numeric)
           FROM public.point_rules pr
           WHERE pr.guild_id = m.guild_id
             AND pr.rule_type = 'time_multiplier'
             AND pr.enabled = true
             AND (
               ((pr.config->>'start_hour')::int <= (pr.config->>'end_hour')::int
                AND EXTRACT(HOUR FROM dr.death_time AT TIME ZONE v_tz) >= (pr.config->>'start_hour')::int
                AND EXTRACT(HOUR FROM dr.death_time AT TIME ZONE v_tz) < (pr.config->>'end_hour')::int)
               OR
               ((pr.config->>'start_hour')::int > (pr.config->>'end_hour')::int
                AND (EXTRACT(HOUR FROM dr.death_time AT TIME ZONE v_tz) >= (pr.config->>'start_hour')::int
                     OR EXTRACT(HOUR FROM dr.death_time AT TIME ZONE v_tz) < (pr.config->>'end_hour')::int))
             )
          ), 1)
      ), 0) AS bp,
      COUNT(DISTINCT dr.id) AS bk
    FROM public.members m
    LEFT JOIN public.attendance_records ar ON ar.member_id = m.id
    LEFT JOIN public.death_records dr ON dr.id = ar.death_record_id
      AND dr.server_id = p_server_id
      AND (p_since IS NULL OR dr.death_time >= p_since)
      AND (p_until IS NULL OR dr.death_time <= p_until)
      AND (p_since IS NOT NULL OR ar.created_at >= COALESCE(
        (v_guild_resets->>m.guild_id::text)::timestamptz,
        '1970-01-01T00:00:00Z'::timestamptz
      ))
    LEFT JOIN public.bosses b ON b.id = dr.boss_id
    LEFT JOIN (
      SELECT DISTINCT ON (boss_id, guild_id) boss_id, guild_id, points
      FROM public.boss_guilds
      WHERE points IS NOT NULL
      ORDER BY boss_id, guild_id, points DESC
    ) bg ON bg.boss_id = b.id AND bg.guild_id = m.guild_id
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
$$;

GRANT EXECUTE ON FUNCTION get_leaderboard(uuid, timestamptz, timestamptz) TO anon, authenticated;


-- From 040_viewer_rpcs.sql
-- 005_viewer_rpcs.sql
-- Viewer (guest) write operations via RPC with invite_code validation

-- â”€â”€ Viewer Auth â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

create or replace function get_server_by_viewer_key(v_key text)
returns table(id uuid, name text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
    select s.id, s.name
    from servers s
    where s.invite_code = v_key;
end;
$$;

grant execute on function get_server_by_viewer_key(text) to anon, authenticated;

-- â”€â”€ Death Records â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

create or replace function viewer_insert_death_record(
  p_boss_id uuid,
  p_death_time timestamptz,
  p_server_id uuid,
  p_viewer_key text,
  p_owner_guild_id uuid default null
)
returns setof death_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_server_id uuid;
begin
  -- Validate viewer key
  select id into v_server_id from servers where invite_code = p_viewer_key;
  if v_server_id is null or v_server_id <> p_server_id then
    raise exception 'Invalid viewer key';
  end if;

  return query
    insert into death_records (boss_id, user_id, death_time, server_id, owner_guild_id)
    values (p_boss_id, auth.uid(), p_death_time, p_server_id, p_owner_guild_id)
    returning *;
end;
$$;

grant execute on function viewer_insert_death_record(uuid, timestamptz, uuid, text, uuid) to anon, authenticated;

-- â”€â”€

create or replace function viewer_delete_death_record(
  p_death_record_id uuid,
  p_viewer_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_server_id uuid;
begin
  -- Validate viewer key against the death record's server
  select server_id into v_server_id from death_records where id = p_death_record_id;
  if not exists (select 1 from servers where invite_code = p_viewer_key and id = v_server_id) then
    raise exception 'Invalid viewer key';
  end if;

  delete from death_records where id = p_death_record_id;
end;
$$;

grant execute on function viewer_delete_death_record(uuid, text) to anon, authenticated;

-- â”€â”€ Members â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

create or replace function viewer_upsert_member(
  p_name text,
  p_server_id uuid,
  p_viewer_key text
)
returns setof members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_server_id uuid;
  v_member_id uuid;
begin
  -- Validate viewer key
  select id into v_server_id from servers where invite_code = p_viewer_key;
  if v_server_id is null or v_server_id <> p_server_id then
    raise exception 'Invalid viewer key';
  end if;

  -- Upsert member
  select id into v_member_id from members where name = p_name;
  if v_member_id is null then
    return query insert into members (name) values (p_name) returning *;
  else
    return query select * from members where id = v_member_id;
  end if;
end;
$$;

grant execute on function viewer_upsert_member(text, uuid, text) to anon, authenticated;

-- â”€â”€ Attendance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

create or replace function viewer_add_attendance(
  p_death_record_id uuid,
  p_member_id uuid,
  p_viewer_key text
)
returns setof attendance_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_server_id uuid;
begin
  -- Validate viewer key against the death record's server
  select server_id into v_server_id from death_records where id = p_death_record_id;
  if not exists (select 1 from servers where invite_code = p_viewer_key and id = v_server_id) then
    raise exception 'Invalid viewer key';
  end if;

  return query
    insert into attendance_records (death_record_id, member_id, server_id)
    values (p_death_record_id, p_member_id, v_server_id)
    on conflict (death_record_id, member_id) do nothing
    returning *;
end;
$$;

grant execute on function viewer_add_attendance(uuid, uuid, text) to anon, authenticated;

-- â”€â”€

create or replace function viewer_remove_attendance(
  p_attendance_id uuid,
  p_viewer_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_server_id uuid;
begin
  -- Validate viewer key against the attendance record's server
  select dr.server_id into v_server_id
  from attendance_records ar
  join death_records dr on dr.id = ar.death_record_id
  where ar.id = p_attendance_id;

  if not exists (select 1 from servers where invite_code = p_viewer_key and id = v_server_id) then
    raise exception 'Invalid viewer key';
  end if;

  delete from attendance_records where id = p_attendance_id;
end;
$$;

grant execute on function viewer_remove_attendance(uuid, text) to anon, authenticated;


-- From 042_get_all_servers_with_counts.sql
-- 007_get_all_servers_with_counts.sql
-- RPC that returns all servers with member counts for the admin panel.

DROP FUNCTION IF EXISTS get_all_servers_with_counts();

CREATE OR REPLACE FUNCTION get_all_servers_with_counts()
RETURNS TABLE(
  id uuid,
  name text,
  owner_id uuid,
  created_at timestamptz,
  member_count bigint,
  raid_member_count bigint,
  game_name text,
  game_icon_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 
    s.id,
    s.name,
    s.owner_id,
    s.created_at,
    (SELECT COUNT(*) FROM public.server_members sm WHERE sm.server_id = s.id) AS member_count,
    (SELECT COUNT(*) FROM public.members m WHERE m.server_id = s.id) AS raid_member_count,
    g.name AS game_name,
    g.icon_url AS game_icon_url
  FROM public.servers s
  LEFT JOIN public.games g ON g.id = s.game_id
  ORDER BY s.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_all_servers_with_counts() TO authenticated;


-- From 043_guild_analytics.sql
-- â”€â”€ Guild-filtered Analytics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Drops old overloads first, then creates a single version
-- with optional guild_id parameter.

DROP FUNCTION IF EXISTS get_analytics(timestamp with time zone, uuid);
DROP FUNCTION IF EXISTS get_analytics(text, uuid);
DROP FUNCTION IF EXISTS get_analytics(text, uuid, uuid);

CREATE OR REPLACE FUNCTION get_analytics(
  since TEXT,
  s_id UUID DEFAULT NULL,
  guild_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  result JSONB;
  death_filter TEXT := '';
BEGIN
  -- Build optional guild filter: only deaths with attendees from this guild
  IF guild_id IS NOT NULL THEN
    death_filter := format(
      'AND dr.id IN (SELECT DISTINCT ar.death_record_id FROM attendance_records ar JOIN members m ON m.id = ar.member_id WHERE m.guild_id = %L)',
      guild_id
    );
  END IF;

  EXECUTE format('
    WITH filtered_deaths AS (
      SELECT dr.id, dr.death_time, dr.boss_id
      FROM death_records dr
      WHERE dr.death_time >= %L::timestamptz
        AND (%L::uuid IS NULL OR dr.server_id = %L::uuid)
        %s
    ),
    stats AS (
      SELECT
        COUNT(*) AS total_kills,
        COALESCE(SUM(ar_count.cnt), 0) AS total_attendance,
        COUNT(DISTINCT ar.member_id) AS active_members
      FROM filtered_deaths fd
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS cnt, array_agg(member_id) AS mids
        FROM attendance_records ar
        WHERE ar.death_record_id = fd.id
      ) ar_count ON true
    ),
    kills_by_week AS (
      SELECT
        to_char(date_trunc(''week'', fd.death_time), ''Mon DD'') AS week_label,
        COUNT(*)::int AS count
      FROM filtered_deaths fd
      GROUP BY date_trunc(''week'', fd.death_time)
      ORDER BY date_trunc(''week'', fd.death_time) DESC
      LIMIT 12
    ),
    top_bosses AS (
      SELECT b.name, COUNT(*)::int AS kills
      FROM filtered_deaths fd
      JOIN bosses b ON b.id = fd.boss_id
      GROUP BY b.name
      ORDER BY kills DESC
      LIMIT 10
    ),
    top_hunters AS (
      SELECT m.name, COUNT(*)::int AS attended
      FROM filtered_deaths fd
      JOIN attendance_records ar ON ar.death_record_id = fd.id
      JOIN members m ON m.id = ar.member_id
      GROUP BY m.name
      ORDER BY attended DESC
      LIMIT 50
    ),
    kills_by_day AS (
      SELECT
        trim(to_char(fd.death_time, ''Day'')) AS day,
        COUNT(*)::int AS count
      FROM filtered_deaths fd
      GROUP BY date_part(''dow'', fd.death_time), to_char(fd.death_time, ''Day'')
      ORDER BY date_part(''dow'', fd.death_time)
    )
    SELECT jsonb_build_object(
      ''total_kills'', COALESCE((SELECT total_kills FROM stats), 0),
      ''total_attendance'', COALESCE((SELECT total_attendance FROM stats), 0),
      ''active_members'', COALESCE((SELECT active_members FROM stats), 0),
      ''kills_by_week'', COALESCE((SELECT jsonb_agg(row_to_json(kills_by_week.*)) FROM kills_by_week), ''[]''::jsonb),
      ''top_bosses'', COALESCE((SELECT jsonb_agg(row_to_json(top_bosses.*)) FROM top_bosses), ''[]''::jsonb),
      ''top_hunters'', COALESCE((SELECT jsonb_agg(row_to_json(top_hunters.*)) FROM top_hunters), ''[]''::jsonb),
      ''kills_by_day'', COALESCE((SELECT jsonb_agg(row_to_json(kills_by_day.*)) FROM kills_by_day), ''[]''::jsonb)
    ) INTO result;
  ', since, s_id, s_id, death_filter);

  RETURN result;
END;
$$;



