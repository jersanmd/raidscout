-- 094_simplify_moderator_permissions: Consolidate 16 granular permissions into 8 meaningful ones
-- Maps old → new:
--   can_manage_boss_guilds → can_manage_guilds
--   can_edit_death_records, can_edit_participants → can_record_death
--   can_set_spawn, can_rotate_guilds → can_manage_spawns
--   can_manage_moderators, can_manage_raid_members → can_manage_members
--   can_adjust_points, can_export_attendance → can_manage_points
--   can_change_timezone, can_access_integrations, can_manage_viewer_key, can_announce_discord → can_manage_integrations
--   (NEW) can_manage_server_content — enable/disable bosses & activities on server

-- 1. Add new columns
ALTER TABLE public.moderator_permissions
  ADD COLUMN IF NOT EXISTS can_manage_spawns BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_members BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_points BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_integrations BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_server_content BOOLEAN NOT NULL DEFAULT false;

-- 2. Migrate data from old columns to new consolidated columns
UPDATE public.moderator_permissions SET
  -- can_manage_guilds: was guild management, now also absorbs boss-guild assignments
  can_manage_guilds = (can_manage_guilds OR can_manage_boss_guilds),
  
  -- can_record_death: was kill recording, now also absorbs edit/delete + participants
  can_record_death = (can_record_death OR can_edit_death_records OR can_edit_participants),
  
  -- can_manage_spawns: absorbs spawn overrides + guild rotations
  can_manage_spawns = (can_set_spawn OR can_rotate_guilds),
  
  -- can_manage_members: absorbs moderator management + raid members
  can_manage_members = (can_manage_moderators OR can_manage_raid_members),
  
  -- can_manage_points: absorbs point adjustments + attendance export
  can_manage_points = (can_adjust_points OR can_export_attendance),
  
  -- can_manage_integrations: absorbs timezone, integrations, viewer key, discord announce
  can_manage_integrations = (can_change_timezone OR can_access_integrations OR can_manage_viewer_key OR can_announce_discord),
  
  -- can_manage_server_content: NEW — default to false for existing mods, owners enable manually
  can_manage_server_content = false;

-- 3. Drop old columns (after data migration)
ALTER TABLE public.moderator_permissions
  DROP COLUMN IF EXISTS can_manage_viewer_key,
  DROP COLUMN IF EXISTS can_change_timezone,
  DROP COLUMN IF EXISTS can_manage_boss_guilds,
  DROP COLUMN IF EXISTS can_manage_moderators,
  DROP COLUMN IF EXISTS can_access_integrations,
  DROP COLUMN IF EXISTS can_edit_participants,
  DROP COLUMN IF EXISTS can_export_attendance,
  DROP COLUMN IF EXISTS can_manage_raid_members,
  DROP COLUMN IF EXISTS can_adjust_points,
  DROP COLUMN IF EXISTS can_edit_death_records,
  DROP COLUMN IF EXISTS can_set_spawn,
  DROP COLUMN IF EXISTS can_rotate_guilds,
  DROP COLUMN IF EXISTS can_announce_discord;

-- 4. Update the upsert RPC to use new columns
CREATE OR REPLACE FUNCTION public.upsert_moderator_permissions(
  p_server_id UUID,
  p_user_id UUID,
  p_can_access_settings BOOLEAN DEFAULT false,
  p_can_manage_guilds BOOLEAN DEFAULT false,
  p_can_record_death BOOLEAN DEFAULT false,
  p_can_manage_spawns BOOLEAN DEFAULT false,
  p_can_manage_members BOOLEAN DEFAULT false,
  p_can_manage_points BOOLEAN DEFAULT false,
  p_can_manage_integrations BOOLEAN DEFAULT false,
  p_can_manage_server_content BOOLEAN DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Verify caller is owner or admin
  IF NOT EXISTS (
    SELECT 1 FROM public.server_members sm
    WHERE sm.server_id = p_server_id
      AND sm.user_id = auth.uid()
      AND sm.role = 'owner'
  ) AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only server owners can manage moderator permissions';
  END IF;

  INSERT INTO public.moderator_permissions (
    server_id, user_id,
    can_access_settings, can_manage_guilds, can_record_death,
    can_manage_spawns, can_manage_members, can_manage_points,
    can_manage_integrations, can_manage_server_content
  ) VALUES (
    p_server_id, p_user_id,
    p_can_access_settings, p_can_manage_guilds, p_can_record_death,
    p_can_manage_spawns, p_can_manage_members, p_can_manage_points,
    p_can_manage_integrations, p_can_manage_server_content
  )
  ON CONFLICT (server_id, user_id) DO UPDATE SET
    can_access_settings = EXCLUDED.can_access_settings,
    can_manage_guilds = EXCLUDED.can_manage_guilds,
    can_record_death = EXCLUDED.can_record_death,
    can_manage_spawns = EXCLUDED.can_manage_spawns,
    can_manage_members = EXCLUDED.can_manage_members,
    can_manage_points = EXCLUDED.can_manage_points,
    can_manage_integrations = EXCLUDED.can_manage_integrations,
    can_manage_server_content = EXCLUDED.can_manage_server_content;
END;
$$;
