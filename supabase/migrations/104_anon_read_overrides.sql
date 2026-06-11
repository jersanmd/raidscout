-- 104_anon_read_overrides: Allow viewers to read spawn overrides
-- Fixes force-spawned bosses showing countdown instead of alive in viewer mode.

DROP POLICY IF EXISTS "Anon users can read overrides" ON public.boss_spawn_overrides;
CREATE POLICY "Anon users can read overrides" ON public.boss_spawn_overrides FOR SELECT USING (true);
