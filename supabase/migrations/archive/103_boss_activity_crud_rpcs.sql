-- 103_boss_activity_crud_rpcs: SECURITY DEFINER RPCs for boss/activity CRUD — bypass RLS

-- Update custom boss (bypasses RLS)
CREATE OR REPLACE FUNCTION public.update_custom_boss(
  p_boss_id uuid, p_name text, p_spawn_type text,
  p_respawn_hours numeric, p_schedule jsonb, p_is_recurring boolean,
  p_boss_points integer, p_category text, p_tags text[],
  p_image_url text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.bosses SET
    name = p_name, spawn_type = p_spawn_type,
    respawn_hours = p_respawn_hours, schedule = p_schedule,
    is_recurring = p_is_recurring, boss_points = p_boss_points,
    category = p_category, tags = p_tags,
    image_url = p_image_url
  WHERE id = p_boss_id;
END; $$;

-- Update custom activity (bypasses RLS)
CREATE OR REPLACE FUNCTION public.update_custom_activity(
  p_activity_id uuid, p_name text, p_schedule_type text,
  p_schedule jsonb, p_duration_minutes integer,
  p_points_per_participant integer, p_party_size integer,
  p_category text, p_tags text[], p_image_url text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.activities SET
    name = p_name, schedule_type = p_schedule_type,
    schedule = p_schedule, duration_minutes = p_duration_minutes,
    points_per_participant = p_points_per_participant,
    party_size = p_party_size, category = p_category,
    tags = p_tags, image_url = p_image_url
  WHERE id = p_activity_id;
END; $$;

-- Toggle activity enabled (bypasses RLS)
CREATE OR REPLACE FUNCTION public.toggle_activity_enabled(
  p_activity_id uuid, p_enabled boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.activities SET is_enabled = p_enabled WHERE id = p_activity_id;
END; $$;

-- Set boss salary (bypasses RLS)
CREATE OR REPLACE FUNCTION public.set_boss_salary(
  p_boss_id uuid, p_has_salary boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.bosses SET has_salary = p_has_salary WHERE id = p_boss_id;
END; $$;
