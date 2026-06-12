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
    'guilds', (SELECT COUNT(*) FROM public.guilds g JOIN public.servers s ON s.id = g.server_id WHERE s.deleted_at IS NULL),
    'kills', (SELECT COUNT(*) FROM public.death_records dr JOIN public.servers s ON s.id = dr.server_id WHERE s.deleted_at IS NULL),
    'players', (SELECT COUNT(*) FROM public.members m JOIN public.servers s ON s.id = m.server_id WHERE s.deleted_at IS NULL),
    'servers', (SELECT COUNT(*) FROM public.servers WHERE deleted_at IS NULL)
  ) INTO result;
  RETURN result;
END;
$$;
