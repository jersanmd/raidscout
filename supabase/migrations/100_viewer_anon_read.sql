-- 100_viewer_anon_read: Allow viewers (anon users) to read bosses, activities, and activity instances
-- Viewers authenticate via viewer key but don't get a Supabase auth session,
-- so we need permissive SELECT policies for anon users.

-- Activities
DROP POLICY IF EXISTS "Anon users can read activities" ON public.activities;
CREATE POLICY "Anon users can read activities" ON public.activities FOR SELECT USING (true);

-- Bosses (in case existing policy is too restrictive)
DROP POLICY IF EXISTS "Anon users can read bosses" ON public.bosses;
CREATE POLICY "Anon users can read bosses" ON public.bosses FOR SELECT USING (true);

-- Activity instances
DROP POLICY IF EXISTS "Anon users can read activity_instances" ON public.activity_instances;
CREATE POLICY "Anon users can read activity_instances" ON public.activity_instances FOR SELECT USING (true);
