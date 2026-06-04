-- Migration 079: Fix bosses RLS — add admin bypass for UPDATE needed by daily rotation switching

DROP POLICY IF EXISTS "Server moderators can manage bosses" ON public.bosses;
CREATE POLICY "Server moderators can manage bosses" ON public.bosses
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.server_members WHERE server_id = bosses.server_id AND user_id = auth.uid() AND role IN ('owner','moderator'))
    OR public.is_admin()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.server_members WHERE server_id = bosses.server_id AND user_id = auth.uid() AND role IN ('owner','moderator'))
    OR public.is_admin()
  );
