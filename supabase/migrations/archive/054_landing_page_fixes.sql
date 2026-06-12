-- ═══════════════════════════════════════════════════════════════
-- Landing page: public stats function + anon read access
-- The landing page at raidscout.com needs anonymous access to
-- basic stats and the demo server's data.
-- ═══════════════════════════════════════════════════════════════

-- 1. Public stats RPC (used by landing page counter animation)
CREATE OR REPLACE FUNCTION public.get_public_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'guilds', (SELECT COUNT(DISTINCT server_id) FROM public.guilds),
    'kills', (SELECT COUNT(*) FROM public.death_records),
    'players', (SELECT COUNT(*) FROM public.members),
    'servers', (SELECT COUNT(*) FROM public.servers WHERE deleted_at IS NULL)
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_stats() TO anon, authenticated;

-- 2. Allow anon (unauthenticated) read on servers for landing page
-- The landing page verifies the demo server exists
DROP POLICY IF EXISTS "Anyone can read servers" ON public.servers;
CREATE POLICY "Anyone can read servers" ON public.servers
  FOR SELECT USING (true);

-- 3. Allow anon read on bosses (landing page shows recent bosses)
-- First drop any authenticated-only policy that conflicts
DROP POLICY IF EXISTS "Authenticated users can read bosses" ON public.bosses;
DROP POLICY IF EXISTS "Server members can read bosses" ON public.bosses;
CREATE POLICY "Anyone can read bosses" ON public.bosses
  FOR SELECT USING (true);

-- 4. Allow anon read on death_records (landing page shows recent kills)
DROP POLICY IF EXISTS "Authenticated users can read death records" ON public.death_records;
DROP POLICY IF EXISTS "Users can read their own death records" ON public.death_records;
DROP POLICY IF EXISTS "Server members can read death records" ON public.death_records;
CREATE POLICY "Anyone can read death records" ON public.death_records
  FOR SELECT USING (true);

-- 5. Allow anon read on guilds (landing page stats)
DROP POLICY IF EXISTS "Server members can read guilds" ON public.guilds;
DROP POLICY IF EXISTS "Authenticated users can read guilds" ON public.guilds;
CREATE POLICY "Anyone can read guilds" ON public.guilds
  FOR SELECT USING (true);

-- 6. Allow anon read on members (landing page stats)
DROP POLICY IF EXISTS "Server members can read members" ON public.members;
DROP POLICY IF EXISTS "Authenticated users can read members" ON public.members;
CREATE POLICY "Anyone can read members" ON public.members
  FOR SELECT USING (true);
