-- 016_viewer_activity_rpcs: Viewer RPCs for activity tables
-- SECURITY DEFINER functions with viewer key validation.

CREATE OR REPLACE FUNCTION public.viewer_get_activities(
  v_server_id UUID,
  v_key TEXT
) RETURNS SETOF public.activities
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.servers WHERE id = v_server_id AND viewer_key = v_key::UUID) THEN
    RAISE EXCEPTION 'Invalid viewer key';
  END IF;
  RETURN QUERY SELECT * FROM public.activities WHERE server_id = v_server_id AND is_enabled = true ORDER BY name;
END;
$$;

CREATE OR REPLACE FUNCTION public.viewer_get_activity_instances(
  v_server_id UUID,
  v_key TEXT
) RETURNS TABLE(
  id UUID, activity_id UUID, start_time TIMESTAMPTZ, end_time TIMESTAMPTZ, created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.servers WHERE id = v_server_id AND viewer_key = v_key::UUID) THEN
    RAISE EXCEPTION 'Invalid viewer key';
  END IF;
  RETURN QUERY
  SELECT ai.id, ai.activity_id, ai.start_time, ai.end_time, ai.created_at
  FROM public.activity_instances ai
  JOIN public.activities a ON a.id = ai.activity_id
  WHERE a.server_id = v_server_id
  ORDER BY ai.start_time DESC
  LIMIT 200;
END;
$$;

CREATE OR REPLACE FUNCTION public.viewer_get_activity_parties(
  v_instance_id UUID,
  v_key TEXT
) RETURNS SETOF public.activity_parties
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_server_id UUID;
BEGIN
  SELECT a.server_id INTO v_server_id
  FROM public.activity_instances ai
  JOIN public.activities a ON a.id = ai.activity_id
  WHERE ai.id = v_instance_id;
  
  IF NOT EXISTS (SELECT 1 FROM public.servers WHERE id = v_server_id AND viewer_key = v_key::UUID) THEN
    RAISE EXCEPTION 'Invalid viewer key';
  END IF;
  
  RETURN QUERY SELECT * FROM public.activity_parties WHERE activity_instance_id = v_instance_id ORDER BY party_number;
END;
$$;
