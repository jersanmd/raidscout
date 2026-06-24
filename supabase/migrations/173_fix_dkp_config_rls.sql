-- 173: Fix DKP config RLS — add WITH CHECK for INSERT (required for upsert to work)
DROP POLICY IF EXISTS "Owner and mods can update dkp config" ON public.dkp_config;
DROP POLICY IF EXISTS "Owner and mods can manage dkp config" ON public.dkp_config;

CREATE POLICY "Owner and mods can manage dkp config" ON public.dkp_config
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.server_members WHERE server_id = dkp_config.server_id AND user_id = auth.uid() AND role IN ('owner', 'moderator'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.server_members WHERE server_id = dkp_config.server_id AND user_id = auth.uid() AND role IN ('owner', 'moderator'))
  );
