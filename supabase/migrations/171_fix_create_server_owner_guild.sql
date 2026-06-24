-- 171: Ensure create_server_with_bosses adds owner + auto-assigns guild to bosses/activities
CREATE OR REPLACE FUNCTION public.create_server_with_bosses(
  p_name TEXT,
  p_game_id UUID,
  p_seed BOOLEAN DEFAULT true,
  p_guild_name TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_server_id UUID;
  v_user_id UUID;
  v_count INTEGER;
  v_guild_id UUID;
  v_guild_count INTEGER;
BEGIN
  v_user_id := auth.uid();

  INSERT INTO public.servers (name, owner_id, game_id, trial_ends_at)
  VALUES (p_name, v_user_id, p_game_id, now() + INTERVAL '7 days')
  RETURNING id INTO v_server_id;

  -- Ensure server owner is added as a member with 'owner' role
  INSERT INTO public.server_members (server_id, user_id, role)
  VALUES (v_server_id, v_user_id, 'owner')
  ON CONFLICT (server_id, user_id) DO NOTHING;

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

  -- ── Auto-assign single guild to all bosses & activities ──
  SELECT COUNT(*) INTO v_guild_count FROM public.guilds WHERE server_id = v_server_id;
  IF v_guild_count = 1 THEN
    SELECT id INTO v_guild_id FROM public.guilds WHERE server_id = v_server_id LIMIT 1;

    -- Assign all bosses to this guild with rotation mode
    INSERT INTO public.boss_guilds (boss_id, guild_id, sort_order, mode)
    SELECT b.id, v_guild_id, 1, 'rotation'
    FROM public.bosses b
    WHERE b.server_id = v_server_id
    ON CONFLICT DO NOTHING;

    -- Assign all activities to this guild with rotation mode
    INSERT INTO public.activity_guilds (activity_id, guild_id, sort_order, mode)
    SELECT a.id, v_guild_id, 1, 'rotation'
    FROM public.activities a
    WHERE a.server_id = v_server_id
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_server_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_server_with_bosses(TEXT, UUID, BOOLEAN, TEXT) TO authenticated;
