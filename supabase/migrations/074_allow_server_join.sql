-- Allow users to join servers (insert their own server_members row)
-- The join_server_by_invite RPC inserts into server_members, and regular
-- users need permission to add themselves as moderators.

DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can join servers" ON server_members;

  CREATE POLICY "Users can join servers" ON server_members
    FOR INSERT
    WITH CHECK (user_id = auth.uid());
END $$;
