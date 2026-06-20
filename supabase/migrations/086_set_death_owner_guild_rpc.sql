-- 086: SECURITY DEFINER RPC to set display_owner_guild_id on death_records
-- Bypasses the "user_id = auth.uid()" RLS that blocks moderators/owners from
-- updating death records they didn't create.

CREATE OR REPLACE FUNCTION set_death_owner_guild(
  p_death_record_id UUID,
  p_guild_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only server owners/moderators can set display guild (plus admins)
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.death_records dr
    JOIN public.bosses b ON b.id = dr.boss_id
    JOIN public.server_members sm ON sm.server_id = b.server_id
    WHERE dr.id = p_death_record_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'moderator')
  ) THEN
    RAISE EXCEPTION 'You are not authorized to set the display guild for this death record';
  END IF;

  UPDATE public.death_records
  SET display_owner_guild_id = p_guild_id
  WHERE id = p_death_record_id;

  RETURN TRUE;
END;
$$;
