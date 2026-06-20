-- 089: Add image_url parameter to create_custom_boss and create_custom_activity RPCs
-- The frontend already passes p_image_url but the RPCs ignored it.

CREATE OR REPLACE FUNCTION public.create_custom_boss(
  p_server_id UUID, p_name TEXT, p_spawn_type TEXT,
  p_respawn_hours INTEGER DEFAULT NULL,
  p_schedule JSONB DEFAULT NULL,
  p_is_recurring BOOLEAN DEFAULT true,
  p_boss_points INTEGER DEFAULT 1,
  p_category TEXT DEFAULT NULL,
  p_tags TEXT[] DEFAULT '{}',
  p_image_url TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_id UUID; v_pts INTEGER;
BEGIN
  v_pts := COALESCE(p_boss_points, 1);
  INSERT INTO public.bosses (server_id, template_id, name, spawn_type, respawn_hours, schedule, is_recurring, is_enabled, is_custom, boss_points, points, category, tags, image_url)
  VALUES (p_server_id, NULL, p_name, p_spawn_type, p_respawn_hours, p_schedule, p_is_recurring, true, true, v_pts, v_pts, p_category, p_tags, p_image_url)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_custom_activity(
  p_server_id UUID, p_name TEXT, p_schedule_type TEXT,
  p_schedule JSONB DEFAULT NULL,
  p_points_per_participant INTEGER DEFAULT 1,
  p_party_size INTEGER DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_tags TEXT[] DEFAULT '{}',
  p_duration_minutes INTEGER DEFAULT NULL,
  p_image_url TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.activities (server_id, template_id, name, schedule_type, schedule, points_per_participant, party_size, is_enabled, is_custom, category, tags, duration_minutes, image_url)
  VALUES (p_server_id, NULL, p_name, p_schedule_type, p_schedule, p_points_per_participant, p_party_size, true, true, p_category, p_tags, p_duration_minutes, p_image_url)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
