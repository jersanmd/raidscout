-- 027_viewer_gear_access: Allow anon/viewer read access to items, servers, members, and guilds
-- Necessary for equipment display on member profiles and gear tracking tab in viewer mode

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

-- members: Add viewer/anonymous read access (needed for member_gear policy subqueries + gear tab)
DROP POLICY IF EXISTS "Viewers can read members" ON public.members;
CREATE POLICY "Viewers can read members" ON public.members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.servers s
      WHERE s.id = members.server_id AND s.viewer_key IS NOT NULL
    )
  );

-- guilds: Add viewer/anonymous read access (needed for gear tab guild display)
DROP POLICY IF EXISTS "Viewers can read guilds" ON public.guilds;
CREATE POLICY "Viewers can read guilds" ON public.guilds
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.servers s
      WHERE s.id = guilds.server_id AND s.viewer_key IS NOT NULL
    )
  );
