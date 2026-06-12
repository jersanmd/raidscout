-- Migration 071: Add admin bypass to is_member_of_server
-- Admins viewing a server via admin panel are not in server_members,
-- so every RLS policy using is_member_of_server() blocks them.
-- This includes: boss_assists, boss_guilds (salary toggle), and others.

CREATE OR REPLACE FUNCTION public.is_member_of_server(sid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Platform admins have full access to all servers
  IF public.is_admin() THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.server_members
    WHERE server_id = sid AND user_id = auth.uid()
  );
END;
$$;
