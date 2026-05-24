-- 007_get_all_servers_with_counts.sql
-- RPC that returns all servers with member counts for the admin panel.

DROP FUNCTION IF EXISTS get_all_servers_with_counts();

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

GRANT EXECUTE ON FUNCTION get_all_servers_with_counts() TO authenticated;
