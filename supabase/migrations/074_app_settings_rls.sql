-- Migration 073: Fix app_settings RLS — allow server members to manage settings for their server
-- The "Finalize" button saves leaderboard_reset_at to app_settings, but RLS only allowed admins to INSERT/UPDATE.
-- Server owners/moderators are not platform admins, so the reset date was silently failing.

CREATE POLICY "Server members can manage app settings" ON public.app_settings
  FOR ALL
  USING (public.is_member_of_server(server_id))
  WITH CHECK (public.is_member_of_server(server_id));
