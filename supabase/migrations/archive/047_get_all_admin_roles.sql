-- Cross-server lookup for admin panel: get all moderator user IDs
-- Uses SECURITY DEFINER to bypass RLS

CREATE OR REPLACE FUNCTION get_all_admin_roles()
RETURNS TABLE(user_id uuid, role text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT sm.user_id, sm.role
  FROM public.server_members sm
  WHERE sm.role IN ('owner', 'moderator');
$$;

GRANT EXECUTE ON FUNCTION get_all_admin_roles() TO authenticated;
