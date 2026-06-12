-- 012_update_create_server_rpc: Rewrite create_server_with_bosses for multi-game
-- Accepts game_id + seed flag. No longer hardcodes LordNine bosses.

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
