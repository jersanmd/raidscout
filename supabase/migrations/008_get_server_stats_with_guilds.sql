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
