-- bot_server_snapshot RPC — single call replacing 7+ REST queries per cron tick
-- Returns all data the spawn cron needs for one server
CREATE OR REPLACE FUNCTION bot_server_snapshot(p_server_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'timezone', COALESCE(s.timezone, 'Asia/Manila'),
    'bosses', COALESCE((
      SELECT jsonb_agg(row_to_json(b))
      FROM bosses b
      WHERE b.server_id = p_server_id
        AND b.is_enabled IS NOT FALSE
        AND b.deleted_at IS NULL
    ), '[]'::jsonb),
    'deaths', COALESCE((
      SELECT jsonb_agg(row_to_json(d))
      FROM (
        SELECT DISTINCT ON (boss_id) *
        FROM death_records
        WHERE server_id = p_server_id
          AND is_initial_spawn IS NOT TRUE
        ORDER BY boss_id, death_time DESC
      ) d
    ), '[]'::jsonb),
    'guilds', COALESCE((
      SELECT jsonb_agg(row_to_json(g))
      FROM guilds g
      WHERE g.server_id = p_server_id
    ), '[]'::jsonb),
    'overrides', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('boss_id', o.boss_id, 'death_time', o.death_time))
      FROM boss_spawn_overrides o
      WHERE o.server_id = p_server_id
    ), '[]'::jsonb),
    'boss_guilds', COALESCE((
      SELECT jsonb_agg(row_to_json(bg))
      FROM boss_guilds bg
      WHERE bg.guild_id IN (SELECT id FROM guilds WHERE server_id = p_server_id)
    ), '[]'::jsonb),
    'boss_assists', COALESCE((
      SELECT jsonb_agg(row_to_json(ba))
      FROM boss_assists ba
      WHERE ba.boss_id IN (SELECT id FROM bosses WHERE server_id = p_server_id AND is_enabled IS NOT FALSE AND deleted_at IS NULL)
    ), '[]'::jsonb),
    'activities', COALESCE((
      SELECT jsonb_agg(row_to_json(a))
      FROM activities a
      WHERE a.server_id = p_server_id
        AND a.is_enabled IS NOT FALSE
        AND a.deleted_at IS NULL
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM servers s
  WHERE s.id = p_server_id;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;
