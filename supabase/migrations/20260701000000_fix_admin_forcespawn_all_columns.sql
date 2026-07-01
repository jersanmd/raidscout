-- Fix: admin_forcespawn_all — use death_time column (spawn_window_start/end don't exist)
DROP FUNCTION IF EXISTS public.admin_forcespawn_all(uuid);

CREATE OR REPLACE FUNCTION public.admin_forcespawn_all(p_server_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INT;
BEGIN
  -- Auth check: only admins
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Only admins can force-spawn bosses';
  END IF;

  DELETE FROM public.boss_spawn_overrides WHERE server_id = p_server_id;

  WITH forced AS (
    INSERT INTO public.boss_spawn_overrides (server_id, boss_id, death_time)
    SELECT
      p_server_id,
      b.id,
      NOW() - (COALESCE(b.respawn_hours, 24) || ' hours')::INTERVAL
    FROM public.bosses b
    WHERE b.server_id = p_server_id
      AND b.spawn_type = 'fixed_hours'
      AND b.is_enabled IS NOT FALSE
      AND b.deleted_at IS NULL
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM forced;

  RETURN v_count;
END;
$$;
