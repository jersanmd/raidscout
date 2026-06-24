-- 170: Add seed_bosses_from_game RPC (called by create_server_with_bosses on remote DB)
CREATE OR REPLACE FUNCTION public.seed_bosses_from_game(p_server_id UUID, p_game_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO public.bosses (server_id, template_id, name, spawn_type, respawn_hours, schedule, is_enabled, is_custom, boss_points, points)
  SELECT p_server_id, bt.id, bt.name, bt.spawn_type, bt.respawn_hours, bt.schedule, true, false, COALESCE(bt.points, 1), COALESCE(bt.points, 1)
  FROM public.boss_templates bt
  WHERE bt.game_id = p_game_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_bosses_from_game(UUID, UUID) TO authenticated;
