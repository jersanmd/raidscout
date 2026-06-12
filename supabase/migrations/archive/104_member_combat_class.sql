-- 104_member_combat_class: Add combat power, class fields + server-level class list

-- Add combat_power and class to members
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS combat_power INTEGER,
  ADD COLUMN IF NOT EXISTS class TEXT;

-- Store class list per server in app_settings
-- Example: {"classes": ["Warrior", "Mage", "Archer", "Assassin", "Priest"]}
-- Key: member_classes (value is JSONB with a "classes" array)

-- RPC: set member class list for a server
CREATE OR REPLACE FUNCTION public.set_member_classes(
  p_server_id UUID,
  p_classes TEXT[]
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.app_settings (server_id, key, value)
  VALUES (p_server_id, 'member_classes', jsonb_build_object('classes', p_classes))
  ON CONFLICT (server_id, key)
  DO UPDATE SET value = jsonb_build_object('classes', p_classes);
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
