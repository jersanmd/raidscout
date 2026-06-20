-- 095: get_deaths_in_window — returns ALL deaths in a date range
-- Used by WeeklyScheduleView to show death events on each day of the week

CREATE OR REPLACE FUNCTION public.get_deaths_in_window(p_server_id UUID, p_since TIMESTAMPTZ, p_until TIMESTAMPTZ DEFAULT NULL)
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
  SELECT id, boss_id, death_time, owner_guild_id, display_owner_guild_id, is_initial_spawn
  FROM public.death_records
  WHERE server_id = p_server_id
    AND death_time >= p_since
    AND (p_until IS NULL OR death_time <= p_until)
    AND is_initial_spawn = false
  ORDER BY death_time DESC;
$$;
