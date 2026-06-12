-- 032_bundle_guild_into_create_server.sql
-- 1. Bundles guild creation into the server creation RPC to bypass RLS issues
-- 2. Adds RLS policy so authenticated users can check server names

-- Allow any authenticated user to read servers (needed for duplicate name check + refreshServers)
DROP POLICY IF EXISTS "Authenticated users can read server names" ON public.servers;
CREATE POLICY "Authenticated users can read server names" ON public.servers
  FOR SELECT USING (auth.role() = 'authenticated');

-- Updated RPC: creates server + server_members + guild + seeds all in one SECURITY DEFINER transaction

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
