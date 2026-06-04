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
    'guilds', (SELECT COUNT(*) FROM public.guilds),
    'kills', (SELECT COUNT(*) FROM public.death_records),
    'players', (SELECT COUNT(*) FROM public.members),
    'servers', (SELECT COUNT(*) FROM public.servers WHERE deleted_at IS NULL)
  ) INTO result;
  RETURN result;
END;
$$;
