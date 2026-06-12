-- ═══════════════════════════════════════════════════════════════
-- Fix infinite recursion in server_members RLS policies
-- Same pattern as user_roles: self-referencing policies need
-- a SECURITY DEFINER function to break the recursion chain
-- ═══════════════════════════════════════════════════════════════

-- 1. Create security definer functions for membership checks
CREATE OR REPLACE FUNCTION public.is_member_of_server(sid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.server_members
    WHERE server_id = sid AND user_id = auth.uid()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_owner_of_server(sid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.server_members
    WHERE server_id = sid AND user_id = auth.uid() AND role = 'owner'
  );
END;
$$;

-- 2. Drop existing policies on server_members that cause recursion
DROP POLICY IF EXISTS "Server members can read memberships" ON public.server_members;
DROP POLICY IF EXISTS "Server owners can manage memberships" ON public.server_members;

-- 3. Recreate server_members policies using helper functions
CREATE POLICY "Server members can read memberships" ON public.server_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR is_member_of_server(server_id)
    OR is_admin()
  );

CREATE POLICY "Server owners can manage memberships" ON public.server_members
  FOR ALL USING (
    is_owner_of_server(server_id)
    OR is_admin()
  );

-- 4. Also fix servers policy to use the helper functions
DROP POLICY IF EXISTS "Server members can read their server" ON public.servers;
CREATE POLICY "Server members can read their server" ON public.servers
  FOR SELECT USING (
    is_member_of_server(id)
    OR is_admin()
  );
