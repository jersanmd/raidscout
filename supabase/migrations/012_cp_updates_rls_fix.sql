-- Migration 012: Fix missing DELETE RLS policy for cp_updates
-- Also add WITH CHECK to the UPDATE policy

-- Add DELETE policy for cp_updates (moderators+ only)
DROP POLICY IF EXISTS "Server moderators can delete cp_updates" ON public.cp_updates;
CREATE POLICY "Server moderators can delete cp_updates" ON public.cp_updates
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM server_members WHERE server_id = cp_updates.server_id AND user_id = auth.uid() AND role IN ('owner','moderator'))
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Ensure UPDATE policy has WITH CHECK (needed for authenticated updates)
DROP POLICY IF EXISTS "Server moderators can update cp_updates" ON public.cp_updates;
CREATE POLICY "Server moderators can update cp_updates" ON public.cp_updates
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM server_members WHERE server_id = cp_updates.server_id AND user_id = auth.uid() AND role IN ('owner','moderator'))
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM server_members WHERE server_id = cp_updates.server_id AND user_id = auth.uid() AND role IN ('owner','moderator'))
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
