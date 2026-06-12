-- ═══════════════════════════════════════════════════════════════
-- Admin Panel: get_all_users RPC (joins auth.users with user_roles)
-- The Owners tab in Admin Panel depends on this function.
-- ================================================================
-- Also: get_user_servers RPC — shows servers a user owns/moderates
-- ═══════════════════════════════════════════════════════════════

-- 1. Get all users with their roles (for Admin Panel Owners tab)
CREATE OR REPLACE FUNCTION public.get_all_users()
RETURNS TABLE (
  user_id uuid,
  email text,
  role text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    au.id AS user_id,
    au.email::text,
    COALESCE(ur.role, 'member') AS role,
    au.created_at
  FROM auth.users au
  LEFT JOIN public.user_roles ur ON ur.user_id = au.id
  ORDER BY au.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_users() TO authenticated;

-- 2. Get servers a user owns or moderates (for expanded user view)
CREATE OR REPLACE FUNCTION public.get_user_servers(user_id_input uuid)
RETURNS TABLE (
  server_id uuid,
  server_name text,
  role text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id AS server_id,
    s.name AS server_name,
    sm.role,
    s.created_at
  FROM public.server_members sm
  JOIN public.servers s ON s.id = sm.server_id
  WHERE sm.user_id = user_id_input
  ORDER BY s.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_servers(uuid) TO authenticated;
