CREATE OR REPLACE FUNCTION get_all_servers_with_counts()
RETURNS TABLE(
  id uuid,
  name text,
  owner_id uuid,
  created_at timestamptz,
  member_count bigint,
  raid_member_count bigint
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
    (SELECT COUNT(*) FROM public.members m WHERE m.server_id = s.id) AS raid_member_count
  FROM public.servers s
  ORDER BY s.created_at DESC;
$$;

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

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

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

CREATE OR REPLACE FUNCTION public.create_server_with_bosses(
  p_name TEXT,
  p_game_id UUID,
  p_seed BOOLEAN DEFAULT true
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_server_id UUID;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  -- Create the server
  INSERT INTO public.servers (name, owner_id, game_id)
  VALUES (p_name, v_user_id, p_game_id)
  RETURNING id INTO v_server_id;

  -- Set the creator as owner in server_members
  INSERT INTO public.server_members (server_id, user_id, role)
  VALUES (v_server_id, v_user_id, 'owner');

  -- Seed bosses from templates if requested
  IF p_seed THEN
    INSERT INTO public.bosses (server_id, template_id, name, spawn_type, respawn_hours, schedule)
    SELECT v_server_id, bt.id, bt.name, bt.spawn_type, bt.respawn_hours, bt.schedule
    FROM public.boss_templates bt
    WHERE bt.game_id = p_game_id;

    -- Seed activities from templates if requested
    INSERT INTO public.activities (server_id, template_id, name, schedule_type, schedule, duration_minutes, points_per_participant, party_size)
    SELECT v_server_id, at.id, at.name, at.schedule_type, at.schedule, at.duration_minutes, at.points_per_participant, at.party_size
    FROM public.activity_templates at
    WHERE at.game_id = p_game_id;
  END IF;

  RETURN v_server_id;
END;
$$;

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

CREATE OR REPLACE FUNCTION public.sync_boss_template()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.bosses
  SET name = NEW.name,
      spawn_type = NEW.spawn_type,
      respawn_hours = NEW.respawn_hours,
      schedule = NEW.schedule,
      is_recurring = NEW.is_recurring,
      category = NEW.category,
      tags = NEW.tags,
      points = NEW.points
  WHERE template_id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_activity_template()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.activities
  SET name = NEW.name,
      schedule_type = NEW.schedule_type,
      schedule = NEW.schedule,
      duration_minutes = NEW.duration_minutes,
      points_per_participant = NEW.points_per_participant,
      party_size = NEW.party_size,
      category = NEW.category,
      tags = NEW.tags
  WHERE template_id = NEW.id;
  RETURN NEW;
END;
$$;

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

CREATE OR REPLACE FUNCTION public.viewer_get_activities(
  v_server_id UUID,
  v_key TEXT
) RETURNS SETOF public.activities
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.servers WHERE id = v_server_id AND viewer_key = v_key::UUID) THEN
    RAISE EXCEPTION 'Invalid viewer key';
  END IF;
  RETURN QUERY SELECT * FROM public.activities WHERE server_id = v_server_id AND is_enabled = true ORDER BY name;
END;
$$;

CREATE OR REPLACE FUNCTION public.viewer_get_activity_instances(
  v_server_id UUID,
  v_key TEXT
) RETURNS TABLE(
  id UUID, activity_id UUID, start_time TIMESTAMPTZ, end_time TIMESTAMPTZ, created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.servers WHERE id = v_server_id AND viewer_key = v_key::UUID) THEN
    RAISE EXCEPTION 'Invalid viewer key';
  END IF;
  RETURN QUERY
  SELECT ai.id, ai.activity_id, ai.start_time, ai.end_time, ai.created_at
  FROM public.activity_instances ai
  JOIN public.activities a ON a.id = ai.activity_id
  WHERE a.server_id = v_server_id
  ORDER BY ai.start_time DESC
  LIMIT 200;
END;
$$;

CREATE OR REPLACE FUNCTION public.viewer_get_activity_parties(
  v_instance_id UUID,
  v_key TEXT
) RETURNS SETOF public.activity_parties
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_server_id UUID;
BEGIN
  SELECT a.server_id INTO v_server_id
  FROM public.activity_instances ai
  JOIN public.activities a ON a.id = ai.activity_id
  WHERE ai.id = v_instance_id;
  
  IF NOT EXISTS (SELECT 1 FROM public.servers WHERE id = v_server_id AND viewer_key = v_key::UUID) THEN
    RAISE EXCEPTION 'Invalid viewer key';
  END IF;
  
  RETURN QUERY SELECT * FROM public.activity_parties WHERE activity_instance_id = v_instance_id ORDER BY party_number;
END;
$$;

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
  v_guild_id UUID;
BEGIN
  v_user_id := auth.uid();

  -- Create the server
  INSERT INTO public.servers (name, owner_id, game_id)
  VALUES (p_name, v_user_id, p_game_id)
  RETURNING id INTO v_server_id;

  -- Set the creator as owner in server_members
  INSERT INTO public.server_members (server_id, user_id, role)
  VALUES (v_server_id, v_user_id, 'owner');

  -- Create default guild if name provided
  IF p_guild_name IS NOT NULL AND p_guild_name != '' THEN
    INSERT INTO public.guilds (name, server_id)
    VALUES (p_guild_name, v_server_id);
  END IF;

  -- Seed bosses from templates if requested
  IF p_seed THEN
    INSERT INTO public.bosses (server_id, template_id, name, spawn_type, respawn_hours, schedule)
    SELECT v_server_id, bt.id, bt.name, bt.spawn_type, bt.respawn_hours, bt.schedule
    FROM public.boss_templates bt
    WHERE bt.game_id = p_game_id;

    -- Seed activities from templates if requested
    INSERT INTO public.activities (server_id, template_id, name, schedule_type, schedule, duration_minutes, points_per_participant, party_size)
    SELECT v_server_id, at.id, at.name, at.schedule_type, at.schedule, at.duration_minutes, at.points_per_participant, at.party_size
    FROM public.activity_templates at
    WHERE at.game_id = p_game_id;
  END IF;

  RETURN v_server_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_latest_deaths(p_server_id UUID)
RETURNS TABLE(boss_id UUID, death_time TIMESTAMPTZ, owner_guild_id UUID)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT DISTINCT ON (boss_id) boss_id, death_time, owner_guild_id
  FROM public.death_records
  WHERE server_id = p_server_id
  ORDER BY boss_id, death_time DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_public_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'guilds', (SELECT COUNT(DISTINCT server_id) FROM public.guilds),
    'kills', (SELECT COUNT(*) FROM public.death_records),
    'players', (SELECT COUNT(*) FROM public.members),
    'servers', (SELECT COUNT(*) FROM public.servers WHERE deleted_at IS NULL)
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_bosses_for_server(p_server_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO public.bosses (server_id, name, spawn_type, respawn_hours, schedule, is_enabled, is_custom, boss_points, points)
  VALUES
    (p_server_id, 'Venatus', 'fixed_hours', 10, NULL, true, false, 1, 1),
    (p_server_id, 'Viorent', 'fixed_hours', 10, NULL, true, false, 1, 1),
    (p_server_id, 'Ego', 'fixed_hours', 21, NULL, true, false, 1, 1),
    (p_server_id, 'Lady Dalia', 'fixed_hours', 18, NULL, true, false, 1, 1),
    (p_server_id, 'Livera', 'fixed_hours', 24, NULL, true, false, 1, 1),
    (p_server_id, 'Araneo', 'fixed_hours', 24, NULL, true, false, 1, 1),
    (p_server_id, 'Undomiel', 'fixed_hours', 24, NULL, true, false, 1, 1),
    (p_server_id, 'General Aquleus', 'fixed_hours', 29, NULL, true, false, 1, 1),
    (p_server_id, 'Amentis', 'fixed_hours', 29, NULL, true, false, 1, 1),
    (p_server_id, 'Baron', 'fixed_hours', 32, NULL, true, false, 1, 1),
    (p_server_id, 'Gareth', 'fixed_hours', 32, NULL, true, false, 1, 1),
    (p_server_id, 'Catena', 'fixed_hours', 35, NULL, true, false, 1, 1),
    (p_server_id, 'Larba', 'fixed_hours', 35, NULL, true, false, 1, 1),
    (p_server_id, 'Shuliar', 'fixed_hours', 35, NULL, true, false, 1, 1),
    (p_server_id, 'Titore', 'fixed_hours', 37, NULL, true, false, 1, 1),
    (p_server_id, 'Duplican', 'fixed_hours', 48, NULL, true, false, 1, 1),
    (p_server_id, 'Metus', 'fixed_hours', 48, NULL, true, false, 1, 1),
    (p_server_id, 'Wannitas', 'fixed_hours', 48, NULL, true, false, 1, 1),
    (p_server_id, 'Asta', 'fixed_hours', 62, NULL, true, false, 1, 1),
    (p_server_id, 'Ordo', 'fixed_hours', 62, NULL, true, false, 1, 1),
    (p_server_id, 'Secreta', 'fixed_hours', 62, NULL, true, false, 1, 1),
    (p_server_id, 'Supore', 'fixed_hours', 62, NULL, true, false, 1, 1),
    (p_server_id, 'Auraq', 'fixed_schedule', NULL, '[{"day":5,"time":"22:00"},{"day":3,"time":"21:00"}]'::jsonb, true, false, 1, 1),
    (p_server_id, 'Benji', 'fixed_schedule', NULL, '[{"day":0,"time":"21:00"}]'::jsonb, true, false, 1, 1),
    (p_server_id, 'Chaiflock', 'fixed_schedule', NULL, '[{"day":0,"time":"15:00"}]'::jsonb, true, false, 1, 1),
    (p_server_id, 'Clemantis', 'fixed_schedule', NULL, '[{"day":1,"time":"11:30"},{"day":4,"time":"19:00"}]'::jsonb, true, false, 1, 1),
    (p_server_id, 'Icaruthia', 'fixed_schedule', NULL, '[{"day":2,"time":"21:00"},{"day":5,"time":"21:00"}]'::jsonb, true, false, 1, 1),
    (p_server_id, 'Libitina', 'fixed_schedule', NULL, '[{"day":1,"time":"21:00"},{"day":6,"time":"21:00"}]'::jsonb, true, false, 1, 1),
    (p_server_id, 'Lucus', 'fixed_schedule', NULL, '[{"day":6,"time":"22:00"}]'::jsonb, true, false, 1, 1),
    (p_server_id, 'Milavy', 'fixed_schedule', NULL, '[{"day":6,"time":"15:00"}]'::jsonb, true, false, 1, 1),
    (p_server_id, 'Motti', 'fixed_schedule', NULL, '[{"day":3,"time":"19:00"},{"day":6,"time":"19:00"}]'::jsonb, true, false, 1, 1),
    (p_server_id, 'Neutro', 'fixed_schedule', NULL, '[{"day":2,"time":"19:00"},{"day":4,"time":"11:30"}]'::jsonb, true, false, 1, 1),
    (p_server_id, 'Nevaeh', 'fixed_schedule', NULL, '[{"day":0,"time":"22:00"}]'::jsonb, true, false, 1, 1),
    (p_server_id, 'Rakajeth', 'fixed_schedule', NULL, '[{"day":2,"time":"22:00"},{"day":0,"time":"19:00"}]'::jsonb, true, false, 1, 1),
    (p_server_id, 'Ringor', 'fixed_schedule', NULL, '[{"day":6,"time":"17:00"}]'::jsonb, true, false, 1, 1),
    (p_server_id, 'Roderick', 'fixed_schedule', NULL, '[{"day":5,"time":"19:00"}]'::jsonb, true, false, 1, 1),
    (p_server_id, 'Saphirus', 'fixed_schedule', NULL, '[{"day":0,"time":"17:00"},{"day":2,"time":"11:30"}]'::jsonb, true, false, 1, 1),
    (p_server_id, 'Thymele', 'fixed_schedule', NULL, '[{"day":1,"time":"19:00"},{"day":3,"time":"11:30"}]'::jsonb, true, false, 1, 1),
    (p_server_id, 'Tumier', 'fixed_schedule', NULL, '[{"day":0,"time":"19:00"}]'::jsonb, true, false, 1, 1)
  ON CONFLICT (name, server_id) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_activities_for_server(p_server_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN 0;
END;
$$;

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
BEGIN
  v_user_id := auth.uid();

  INSERT INTO public.servers (name, owner_id, game_id)
  VALUES (p_name, v_user_id, p_game_id)
  RETURNING id INTO v_server_id;

  INSERT INTO public.server_members (server_id, user_id, role)
  VALUES (v_server_id, v_user_id, 'owner');

  IF p_guild_name IS NOT NULL AND p_guild_name != '' THEN
    INSERT INTO public.guilds (name, server_id)
    VALUES (p_guild_name, v_server_id);
  END IF;

  IF p_seed THEN
    -- Try templates first
    INSERT INTO public.bosses (server_id, template_id, name, spawn_type, respawn_hours, schedule, is_enabled, is_custom, boss_points, points)
    SELECT v_server_id, bt.id, bt.name, bt.spawn_type, bt.respawn_hours, bt.schedule, true, false, COALESCE(bt.points, 1), COALESCE(bt.points, 1)
    FROM public.boss_templates bt
    WHERE bt.game_id = p_game_id OR p_game_id IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- Fallback to hardcoded defaults if templates yielded 0
    IF v_count = 0 THEN
      PERFORM public.seed_bosses_for_server(v_server_id);
    END IF;

    INSERT INTO public.activities (server_id, template_id, name, schedule_type, schedule, duration_minutes, points_per_participant, party_size, is_enabled, is_custom)
    SELECT v_server_id, at.id, at.name, at.schedule_type, at.schedule, at.duration_minutes, at.points_per_participant, at.party_size, true, false
    FROM public.activity_templates at
    WHERE at.game_id = p_game_id OR p_game_id IS NULL;
  END IF;

  RETURN v_server_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_from_game(p_server_id UUID, p_game_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_boss_count INTEGER;
  v_act_count INTEGER;
BEGIN
  INSERT INTO public.bosses (server_id, template_id, name, spawn_type, respawn_hours, schedule, is_enabled, is_custom, boss_points, points)
  SELECT p_server_id, bt.id, bt.name, bt.spawn_type, bt.respawn_hours, bt.schedule, true, false, COALESCE(bt.points, 1), COALESCE(bt.points, 1)
  FROM public.boss_templates bt
  WHERE bt.game_id = p_game_id
  ON CONFLICT (name, server_id) DO NOTHING;
  GET DIAGNOSTICS v_boss_count = ROW_COUNT;

  INSERT INTO public.activities (server_id, template_id, name, schedule_type, schedule, duration_minutes, points_per_participant, party_size, is_enabled, is_custom)
  SELECT p_server_id, at.id, at.name, at.schedule_type, at.schedule, at.duration_minutes, at.points_per_participant, at.party_size, true, false
  FROM public.activity_templates at
  WHERE at.game_id = p_game_id;
  GET DIAGNOSTICS v_act_count = ROW_COUNT;

  RETURN jsonb_build_object('b', v_boss_count, 'a', v_act_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_server_members(p_server_id UUID)
RETURNS TABLE(user_id UUID, email TEXT, role TEXT)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT sm.user_id, u.email::TEXT, sm.role
  FROM public.server_members sm
  LEFT JOIN auth.users u ON u.id = sm.user_id
  WHERE sm.server_id = p_server_id;
$$;

CREATE OR REPLACE FUNCTION public.get_server_viewer_key(p_server_id UUID)
RETURNS TEXT
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT viewer_key FROM public.servers WHERE id = p_server_id;
$$;

CREATE OR REPLACE FUNCTION public.delete_server_cascade(p_server_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify ownership
  IF NOT EXISTS (SELECT 1 FROM public.server_members WHERE server_id = p_server_id AND user_id = auth.uid() AND role = 'owner') THEN
    RAISE EXCEPTION 'Only the server owner can delete the server';
  END IF;

  DELETE FROM public.activity_attendance WHERE activity_instance_id IN (SELECT id FROM public.activity_instances WHERE activity_id IN (SELECT id FROM public.activities WHERE server_id = p_server_id));
  DELETE FROM public.activity_parties WHERE activity_instance_id IN (SELECT id FROM public.activity_instances WHERE activity_id IN (SELECT id FROM public.activities WHERE server_id = p_server_id));
  DELETE FROM public.activity_instances WHERE activity_id IN (SELECT id FROM public.activities WHERE server_id = p_server_id);
  DELETE FROM public.activities WHERE server_id = p_server_id;
  DELETE FROM public.attendance_records WHERE death_record_id IN (SELECT id FROM public.death_records WHERE server_id = p_server_id);
  DELETE FROM public.spawn_notifications WHERE server_id = p_server_id;
  DELETE FROM public.death_records WHERE server_id = p_server_id;
  DELETE FROM public.boss_spawn_overrides WHERE server_id = p_server_id;
  DELETE FROM public.boss_guilds WHERE boss_id IN (SELECT id FROM public.bosses WHERE server_id = p_server_id);
  DELETE FROM public.bosses WHERE server_id = p_server_id;
  DELETE FROM public.point_adjustments WHERE server_id = p_server_id;
  DELETE FROM public.point_rules WHERE server_id = p_server_id;
  DELETE FROM public.boss_assists WHERE server_id = p_server_id;
  DELETE FROM public.members WHERE server_id = p_server_id;
  DELETE FROM public.guilds WHERE server_id = p_server_id;
  DELETE FROM public.discord_configs WHERE raidscout_server_id = p_server_id;
  DELETE FROM public.server_members WHERE server_id = p_server_id;
  DELETE FROM public.servers WHERE id = p_server_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_custom_boss(
  p_server_id UUID, p_name TEXT, p_spawn_type TEXT,
  p_respawn_hours INTEGER, p_schedule JSONB,
  p_is_recurring BOOLEAN, p_boss_points INTEGER,
  p_category TEXT, p_tags TEXT[]
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_id UUID; v_pts INTEGER;
BEGIN
  v_pts := COALESCE(p_boss_points, 1);
  INSERT INTO public.bosses (server_id, template_id, name, spawn_type, respawn_hours, schedule, is_recurring, is_enabled, is_custom, boss_points, points, category, tags)
  VALUES (p_server_id, NULL, p_name, p_spawn_type, p_respawn_hours, p_schedule, p_is_recurring, true, true, v_pts, v_pts, p_category, p_tags)
  ON CONFLICT (name, server_id) DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_custom_activity(
  p_server_id UUID, p_name TEXT, p_schedule_type TEXT,
  p_schedule JSONB, p_points_per_participant INTEGER,
  p_party_size INTEGER, p_category TEXT, p_tags TEXT[]
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.activities (server_id, template_id, name, schedule_type, schedule, points_per_participant, party_size, is_enabled, is_custom, category, tags)
  VALUES (p_server_id, NULL, p_name, p_schedule_type, p_schedule, p_points_per_participant, p_party_size, true, true, p_category, p_tags)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_server_cascade(p_server_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.server_members WHERE server_id = p_server_id AND user_id = auth.uid() AND role = 'owner') THEN
    RAISE EXCEPTION 'Only the server owner can delete the server';
  END IF;
  DELETE FROM public.activity_attendance WHERE activity_instance_id IN (SELECT id FROM public.activity_instances WHERE activity_id IN (SELECT id FROM public.activities WHERE server_id = p_server_id));
  DELETE FROM public.activity_parties WHERE activity_instance_id IN (SELECT id FROM public.activity_instances WHERE activity_id IN (SELECT id FROM public.activities WHERE server_id = p_server_id));
  DELETE FROM public.activity_instances WHERE activity_id IN (SELECT id FROM public.activities WHERE server_id = p_server_id);
  DELETE FROM public.activities WHERE server_id = p_server_id;
  DELETE FROM public.attendance_records WHERE death_record_id IN (SELECT id FROM public.death_records WHERE server_id = p_server_id);
  DELETE FROM public.spawn_notifications WHERE server_id = p_server_id;
  DELETE FROM public.death_records WHERE server_id = p_server_id;
  DELETE FROM public.boss_spawn_overrides WHERE server_id = p_server_id;
  DELETE FROM public.boss_guilds WHERE boss_id IN (SELECT id FROM public.bosses WHERE server_id = p_server_id);
  DELETE FROM public.boss_assists WHERE server_id = p_server_id;
  DELETE FROM public.point_adjustments WHERE server_id = p_server_id;
  DELETE FROM public.point_rules WHERE server_id = p_server_id;
  DELETE FROM public.members WHERE server_id = p_server_id;
  DELETE FROM public.guilds WHERE server_id = p_server_id;
  DELETE FROM public.bosses WHERE server_id = p_server_id;
  DELETE FROM public.discord_configs WHERE raidscout_server_id = p_server_id;
  DELETE FROM public.server_members WHERE server_id = p_server_id;
  DELETE FROM public.servers WHERE id = p_server_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_custom_boss(
  p_server_id UUID, p_name TEXT, p_spawn_type TEXT,
  p_respawn_hours INTEGER DEFAULT NULL,
  p_schedule JSONB DEFAULT NULL,
  p_is_recurring BOOLEAN DEFAULT true,
  p_boss_points INTEGER DEFAULT 1,
  p_category TEXT DEFAULT NULL,
  p_tags TEXT[] DEFAULT '{}'
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_id UUID; v_pts INTEGER;
BEGIN
  v_pts := COALESCE(p_boss_points, 1);
  INSERT INTO public.bosses (server_id, template_id, name, spawn_type, respawn_hours, schedule, is_recurring, is_enabled, is_custom, boss_points, points, category, tags)
  VALUES (p_server_id, NULL, p_name, p_spawn_type, p_respawn_hours, p_schedule, p_is_recurring, true, true, v_pts, v_pts, p_category, p_tags)
  ON CONFLICT (name, server_id) DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_custom_activity(
  p_server_id UUID, p_name TEXT, p_schedule_type TEXT,
  p_schedule JSONB DEFAULT NULL,
  p_points_per_participant INTEGER DEFAULT 1,
  p_party_size INTEGER DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_tags TEXT[] DEFAULT '{}'
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.activities (server_id, template_id, name, schedule_type, schedule, points_per_participant, party_size, is_enabled, is_custom, category, tags)
  VALUES (p_server_id, NULL, p_name, p_schedule_type, p_schedule, p_points_per_participant, p_party_size, true, true, p_category, p_tags)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;