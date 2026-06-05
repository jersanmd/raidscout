-- 055_upsert_moderator_permissions: SECURITY DEFINER RPC to bypass RLS for upsert
-- Also ensures a unique index exists on (server_id, user_id)

-- Ensure unique constraint exists (in case table was created without PK)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relname = 'moderator_permissions_pkey'
       OR c.relname = 'moderator_permissions_server_user_idx'
  ) THEN
    -- Try adding PK first; if that fails, add unique index
    BEGIN
      ALTER TABLE public.moderator_permissions ADD PRIMARY KEY (server_id, user_id);
    EXCEPTION WHEN others THEN
      CREATE UNIQUE INDEX IF NOT EXISTS moderator_permissions_server_user_idx
        ON public.moderator_permissions (server_id, user_id);
    END;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_moderator_permissions(
  p_server_id UUID,
  p_user_id UUID,
  p_can_access_settings BOOLEAN DEFAULT false,
  p_can_manage_guilds BOOLEAN DEFAULT false,
  p_can_manage_viewer_key BOOLEAN DEFAULT false,
  p_can_change_timezone BOOLEAN DEFAULT false,
  p_can_manage_boss_guilds BOOLEAN DEFAULT false,
  p_can_manage_moderators BOOLEAN DEFAULT false,
  p_can_access_integrations BOOLEAN DEFAULT false,
  p_can_edit_participants BOOLEAN DEFAULT false,
  p_can_export_attendance BOOLEAN DEFAULT false,
  p_can_manage_raid_members BOOLEAN DEFAULT false,
  p_can_adjust_points BOOLEAN DEFAULT false,
  p_can_record_death BOOLEAN DEFAULT false,
  p_can_edit_death_records BOOLEAN DEFAULT false,
  p_can_set_spawn BOOLEAN DEFAULT false,
  p_can_rotate_guilds BOOLEAN DEFAULT false,
  p_can_announce_discord BOOLEAN DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Verify caller is owner or admin
  IF NOT (
    EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = p_server_id AND sm.user_id = auth.uid() AND sm.role = 'owner')
    OR coalesce(public.is_admin(), false)
  ) THEN
    RAISE EXCEPTION 'Only server owners and platform admins can update moderator permissions';
  END IF;

  -- Check if row exists; update or insert accordingly (avoids ON CONFLICT issues)
  IF EXISTS (SELECT 1 FROM public.moderator_permissions WHERE server_id = p_server_id AND user_id = p_user_id) THEN
    UPDATE public.moderator_permissions SET
      can_access_settings = p_can_access_settings,
      can_manage_guilds = p_can_manage_guilds,
      can_manage_viewer_key = p_can_manage_viewer_key,
      can_change_timezone = p_can_change_timezone,
      can_manage_boss_guilds = p_can_manage_boss_guilds,
      can_manage_moderators = p_can_manage_moderators,
      can_access_integrations = p_can_access_integrations,
      can_edit_participants = p_can_edit_participants,
      can_export_attendance = p_can_export_attendance,
      can_manage_raid_members = p_can_manage_raid_members,
      can_adjust_points = p_can_adjust_points,
      can_record_death = p_can_record_death,
      can_edit_death_records = p_can_edit_death_records,
      can_set_spawn = p_can_set_spawn,
      can_rotate_guilds = p_can_rotate_guilds,
      can_announce_discord = p_can_announce_discord
    WHERE server_id = p_server_id AND user_id = p_user_id;
  ELSE
    INSERT INTO public.moderator_permissions (
      server_id, user_id,
      can_access_settings, can_manage_guilds, can_manage_viewer_key,
      can_change_timezone, can_manage_boss_guilds, can_manage_moderators,
      can_access_integrations, can_edit_participants, can_export_attendance,
      can_manage_raid_members, can_adjust_points, can_record_death,
      can_edit_death_records, can_set_spawn, can_rotate_guilds,
      can_announce_discord
    )
    VALUES (
      p_server_id, p_user_id,
      p_can_access_settings, p_can_manage_guilds, p_can_manage_viewer_key,
      p_can_change_timezone, p_can_manage_boss_guilds, p_can_manage_moderators,
      p_can_access_integrations, p_can_edit_participants, p_can_export_attendance,
      p_can_manage_raid_members, p_can_adjust_points, p_can_record_death,
      p_can_edit_death_records, p_can_set_spawn, p_can_rotate_guilds,
      p_can_announce_discord
    );
  END IF;
END;
$$;

-- RPC to fetch all permissions for a server (bypasses RLS)
CREATE OR REPLACE FUNCTION public.fetch_moderator_permissions(p_server_id UUID)
RETURNS TABLE (
  user_id UUID,
  can_access_settings BOOLEAN,
  can_manage_guilds BOOLEAN,
  can_manage_viewer_key BOOLEAN,
  can_change_timezone BOOLEAN,
  can_manage_boss_guilds BOOLEAN,
  can_manage_moderators BOOLEAN,
  can_access_integrations BOOLEAN,
  can_edit_participants BOOLEAN,
  can_export_attendance BOOLEAN,
  can_manage_raid_members BOOLEAN,
  can_adjust_points BOOLEAN,
  can_record_death BOOLEAN,
  can_edit_death_records BOOLEAN,
  can_set_spawn BOOLEAN,
  can_rotate_guilds BOOLEAN,
  can_announce_discord BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    mp.user_id,
    mp.can_access_settings,
    mp.can_manage_guilds,
    mp.can_manage_viewer_key,
    mp.can_change_timezone,
    mp.can_manage_boss_guilds,
    mp.can_manage_moderators,
    mp.can_access_integrations,
    mp.can_edit_participants,
    mp.can_export_attendance,
    mp.can_manage_raid_members,
    mp.can_adjust_points,
    mp.can_record_death,
    mp.can_edit_death_records,
    mp.can_set_spawn,
    mp.can_rotate_guilds,
    mp.can_announce_discord
  FROM public.moderator_permissions mp
  WHERE mp.server_id = p_server_id;
$$;
