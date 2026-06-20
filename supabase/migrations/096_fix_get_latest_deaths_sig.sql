-- Fix: Restore get_latest_deaths to single-param signature
-- PostgREST JS client doesn't handle DEFAULT parameters reliably

DROP FUNCTION IF EXISTS get_latest_deaths(UUID);
DROP FUNCTION IF EXISTS get_latest_deaths(UUID, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.get_latest_deaths(p_server_id UUID)
RETURNS TABLE(
  id UUID,
  boss_id UUID,
  death_time TIMESTAMPTZ,
  owner_guild_id UUID,
  display_owner_guild_id UUID,
  is_initial_spawn BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT DISTINCT ON (boss_id)
    id, boss_id, death_time, owner_guild_id, display_owner_guild_id, is_initial_spawn
  FROM public.death_records
  WHERE server_id = p_server_id
  ORDER BY boss_id, death_time DESC;
$$;
