-- 009_member_stats_rpc: RPC functions for member combat power, class, and class list management

-- Ensure columns exist
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS combat_power INTEGER;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS class TEXT;

-- RPC: set member class list for a server
CREATE OR REPLACE FUNCTION public.set_member_classes(
  p_server_id UUID,
  p_classes JSONB
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM public.app_settings WHERE server_id = p_server_id AND key = 'member_classes';
  INSERT INTO public.app_settings (server_id, key, value)
  VALUES (p_server_id, 'member_classes', jsonb_build_object('classes', p_classes));
END; $$;

-- RPC: get member class list for a server
CREATE OR REPLACE FUNCTION public.get_member_classes(
  p_server_id UUID
) RETURNS TEXT[] LANGUAGE sql SECURITY DEFINER AS $$
  SELECT COALESCE(
    ARRAY(SELECT jsonb_array_elements_text((value::jsonb)->'classes')),
    ARRAY[]::TEXT[]
  )
  FROM public.app_settings
  WHERE server_id = p_server_id AND key = 'member_classes';
$$;

-- RPC: update member combat_power and class
CREATE OR REPLACE FUNCTION public.update_member_stats(
  p_member_id UUID,
  p_combat_power INTEGER,
  p_class TEXT
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.members
  SET combat_power = p_combat_power, class = p_class
  WHERE id = p_member_id;
END; $$;

-- RLS: allow authenticated users to execute these RPCs
GRANT EXECUTE ON FUNCTION public.set_member_classes TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_member_classes TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_member_stats TO authenticated;
