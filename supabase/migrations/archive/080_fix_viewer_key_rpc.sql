DROP FUNCTION IF EXISTS public.get_server_by_viewer_key(text);

CREATE OR REPLACE FUNCTION public.get_server_by_viewer_key(v_key text)
RETURNS TABLE(id uuid, name text, viewer_can_edit boolean, viewer_can_mark_died boolean, discord_webhook_url text, timezone text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
    SELECT s.id, s.name, s.viewer_can_edit, s.viewer_can_mark_died, s.discord_webhook_url, s.timezone
    FROM public.servers s
    WHERE s.viewer_key = v_key::uuid
      AND s.deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_server_by_viewer_key(text) TO anon, authenticated;
