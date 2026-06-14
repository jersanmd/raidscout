-- 027_viewer_gear_access: Allow anon/viewer read access to items, servers, and members
-- Necessary for equipment display on member profiles in viewer mode

-- items: Add viewer/anonymous read access (for gear item images & names)
DROP POLICY IF EXISTS "Viewers can read items" ON public.items;
CREATE POLICY "Viewers can read items" ON public.items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.servers s
      WHERE s.id = items.server_id AND s.viewer_key IS NOT NULL
    )
  );

-- servers: Add anon read access for viewer-enabled servers
DROP POLICY IF EXISTS "Anon can read viewer servers" ON public.servers;
CREATE POLICY "Anon can read viewer servers" ON public.servers
  FOR SELECT USING (
    viewer_key IS NOT NULL
  );

-- members: Add viewer/anonymous read access (needed for member_gear policy subqueries)
DROP POLICY IF EXISTS "Viewers can read members" ON public.members;
CREATE POLICY "Viewers can read members" ON public.members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.servers s
      WHERE s.id = members.server_id AND s.viewer_key IS NOT NULL
    )
  );
