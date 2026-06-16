-- Update get_all_servers_with_counts RPC to include game_name and game_icon_url
-- Fixes Admin Panel servers grouping by game

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
  game_icon_url text,
  subscription_ends_at timestamptz,
  trial_ends_at timestamptz
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
    g.icon_url AS game_icon_url,
    s.subscription_ends_at,
    s.trial_ends_at
  FROM public.servers s
  LEFT JOIN public.games g ON g.id = s.game_id
  WHERE s.deleted_at IS NULL
  ORDER BY s.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_all_servers_with_counts() TO authenticated;
