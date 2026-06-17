-- 007_discord_configs_rls.sql
-- Add RLS policies for discord_configs so the bot and authenticated users can access them.

-- Allow any authenticated user or anon to read discord_configs
-- (the bot uses service_role which already bypasses RLS, but this is a safety net)

DROP POLICY IF EXISTS "Service role can read discord_configs" ON public.discord_configs;
CREATE POLICY "Service role can read discord_configs" ON public.discord_configs
  FOR SELECT TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage discord_configs" ON public.discord_configs;
CREATE POLICY "Authenticated users can manage discord_configs" ON public.discord_configs
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
