-- 103_admin_forcespawn_all: RPC for admin panel to force-spawn all fixed-timer bosses in a server.

CREATE OR REPLACE FUNCTION public.admin_forcespawn_all(p_server_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INT := 0;
  v_boss RECORD;
  v_now TIMESTAMPTZ := now();
BEGIN
  FOR v_boss IN
    SELECT id, respawn_hours
    FROM public.bosses
    WHERE server_id = p_server_id
      AND is_enabled IS NOT FALSE
      AND deleted_at IS NULL
      AND spawn_type = 'fixed_hours'
  LOOP
    -- Delete existing override
    DELETE FROM public.boss_spawn_overrides
    WHERE boss_id = v_boss.id AND server_id = p_server_id;

    -- Insert new override (set death_time to respawn_hours ago = boss appears spawned)
    INSERT INTO public.boss_spawn_overrides (server_id, boss_id, death_time)
    VALUES (p_server_id, v_boss.id, v_now - (COALESCE(v_boss.respawn_hours, 24) || ' hours')::INTERVAL);

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_forcespawn_all(UUID) TO authenticated;
