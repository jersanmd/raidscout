-- Fix server_members RLS policies to avoid infinite recursion
-- Previous policies had subqueries on server_members itself, which re-triggers RLS.
-- Solution: check ownership via servers.owner_id (no recursion) and simplify SELECT.

DO $$
BEGIN
  -- Drop ALL existing policies on server_members
  DROP POLICY IF EXISTS "Server members can read memberships" ON server_members;
  DROP POLICY IF EXISTS "Server owners can manage memberships" ON server_members;

  -- SELECT: user sees their own memberships + admins see all
  -- (no subquery on server_members to avoid recursion)
  CREATE POLICY "Server members can read memberships" ON server_members
    FOR SELECT USING (
      user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    );

  -- ALL: server owner (checked via servers table) or site admin
  CREATE POLICY "Server owners can manage memberships" ON server_members
    FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM servers
        WHERE servers.id = server_members.server_id
          AND servers.owner_id = auth.uid()
      )
      OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM servers
        WHERE servers.id = server_members.server_id
          AND servers.owner_id = auth.uid()
      )
      OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    );
END $$;
