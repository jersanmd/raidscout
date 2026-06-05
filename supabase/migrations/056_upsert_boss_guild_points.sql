-- 056_upsert_boss_guild_points: SECURITY DEFINER RPC to bypass RLS for points/salary upsert
CREATE OR REPLACE FUNCTION public.upsert_boss_guild_points(
  p_boss_id UUID,
  p_guild_id UUID,
  p_points INTEGER DEFAULT NULL,
  p_has_salary BOOLEAN DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INT;
BEGIN
  -- Verify caller is a member of the boss's server (owner, moderator, or regular member)
  IF NOT EXISTS (
    SELECT 1 FROM public.bosses b
    JOIN public.server_members sm ON sm.server_id = b.server_id
    WHERE b.id = p_boss_id AND sm.user_id = auth.uid()
  ) THEN
    -- Also allow platform admins
    IF NOT coalesce(public.is_admin(), false) THEN
      RAISE EXCEPTION 'You are not a member of the server that owns this boss';
    END IF;
  END IF;

  -- Check if any rows exist for this boss+guild
  SELECT COUNT(*) INTO v_count FROM public.boss_guilds
  WHERE boss_id = p_boss_id AND guild_id = p_guild_id;

  IF v_count > 0 THEN
    -- Update ALL existing rows for this boss+guild
    UPDATE public.boss_guilds SET
      points = COALESCE(p_points, points),
      has_salary = COALESCE(p_has_salary, has_salary)
    WHERE boss_id = p_boss_id AND guild_id = p_guild_id;
  ELSE
    -- Insert a points/salary-only row (not a guild assignment)
    INSERT INTO public.boss_guilds (boss_id, guild_id, sort_order, day_of_week, mode, points, has_salary)
    VALUES (p_boss_id, p_guild_id, -1, NULL, 'rotation', p_points, COALESCE(p_has_salary, false));
  END IF;
END;
$$;
