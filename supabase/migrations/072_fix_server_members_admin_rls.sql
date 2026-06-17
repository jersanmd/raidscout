-- Fix: Add explicit WITH CHECK for admins inserting into server_members
-- The existing FOR ALL USING policy may not correctly handle INSERT for admins.

DO $$
DECLARE
  pol_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'server_members'
      AND policyname = 'Server owners can manage memberships'
  ) INTO pol_exists;

  IF pol_exists THEN
    DROP POLICY "Server owners can manage memberships" ON server_members;
  END IF;

  CREATE POLICY "Server owners can manage memberships" ON server_members
    FOR ALL
    USING (
      EXISTS (SELECT 1 FROM server_members WHERE server_id = server_members.server_id AND user_id = auth.uid() AND role = 'owner')
      OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    )
    WITH CHECK (
      EXISTS (SELECT 1 FROM server_members WHERE server_id = server_members.server_id AND user_id = auth.uid() AND role = 'owner')
      OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    );
END $$;
