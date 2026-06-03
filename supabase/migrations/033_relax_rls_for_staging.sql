-- 033_relax_rls_for_staging.sql
-- For staging/dev: relax RLS so authenticated users can read/write all core tables

-- Servers: allow authenticated users full access
DROP POLICY IF EXISTS "Server members can read their server" ON public.servers;
CREATE POLICY "Authenticated users can read servers" ON public.servers
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Server owners can update their server" ON public.servers;
CREATE POLICY "Authenticated users can update servers" ON public.servers
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Server members: allow all
DROP POLICY IF EXISTS "Server members can read memberships" ON public.server_members;
CREATE POLICY "Authenticated users can read memberships" ON public.server_members
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Server owners can manage memberships" ON public.server_members;
CREATE POLICY "Authenticated users can manage memberships" ON public.server_members
  FOR ALL USING (auth.role() = 'authenticated');

-- Guilds: allow authenticated users
DROP POLICY IF EXISTS "Server members can read guilds" ON public.guilds;
CREATE POLICY "Authenticated users can read guilds" ON public.guilds
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Server moderators can manage guilds" ON public.guilds;
CREATE POLICY "Authenticated users can manage guilds" ON public.guilds
  FOR ALL USING (auth.role() = 'authenticated');

-- Bosses: allow authenticated users
DROP POLICY IF EXISTS "Server members can read bosses" ON public.bosses;
CREATE POLICY "Authenticated users can read bosses" ON public.bosses
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Server moderators can manage bosses" ON public.bosses;
CREATE POLICY "Authenticated users can manage bosses" ON public.bosses
  FOR ALL USING (auth.role() = 'authenticated');

-- Death records: allow authenticated
DROP POLICY IF EXISTS "Server members can read death records" ON public.death_records;
CREATE POLICY "Authenticated users can read death records" ON public.death_records
  FOR SELECT USING (auth.role() = 'authenticated');

-- Members: allow authenticated
DROP POLICY IF EXISTS "Server members can read members" ON public.members;
CREATE POLICY "Authenticated users can read members" ON public.members
  FOR SELECT USING (auth.role() = 'authenticated');

-- Activities: allow authenticated (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'activities') THEN
    DROP POLICY IF EXISTS "Authenticated users can read activities" ON public.activities;
    CREATE POLICY "Authenticated users can read activities" ON public.activities FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END;
$$;

-- User roles: allow authenticated users to read their own role
DROP POLICY IF EXISTS "Admins can read roles" ON public.user_roles;
CREATE POLICY "Authenticated users can read roles" ON public.user_roles
  FOR SELECT USING (auth.role() = 'authenticated');
