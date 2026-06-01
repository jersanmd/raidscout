-- 024_moderator_permissions: Granular moderator permission controls
-- Each moderator gets a row with 16 boolean permission flags.
-- Owners always have full access (no row needed).
-- Platform admins (user_roles.role = 'admin') always have full access.

CREATE TABLE IF NOT EXISTS public.moderator_permissions (
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  can_access_settings BOOLEAN NOT NULL DEFAULT false,
  can_manage_guilds BOOLEAN NOT NULL DEFAULT false,
  can_manage_viewer_key BOOLEAN NOT NULL DEFAULT false,
  can_change_timezone BOOLEAN NOT NULL DEFAULT false,
  can_manage_boss_guilds BOOLEAN NOT NULL DEFAULT false,
  can_manage_moderators BOOLEAN NOT NULL DEFAULT false,
  can_access_integrations BOOLEAN NOT NULL DEFAULT false,
  can_edit_participants BOOLEAN NOT NULL DEFAULT false,
  can_export_attendance BOOLEAN NOT NULL DEFAULT false,
  can_manage_raid_members BOOLEAN NOT NULL DEFAULT false,
  can_adjust_points BOOLEAN NOT NULL DEFAULT false,
  can_record_death BOOLEAN NOT NULL DEFAULT false,
  can_edit_death_records BOOLEAN NOT NULL DEFAULT false,
  can_set_spawn BOOLEAN NOT NULL DEFAULT false,
  can_rotate_guilds BOOLEAN NOT NULL DEFAULT false,
  can_announce_discord BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (server_id, user_id)
);

ALTER TABLE public.moderator_permissions ENABLE ROW LEVEL SECURITY;

-- RLS: owner + admin can read/write; moderator can read own row
CREATE POLICY "Owner can manage permissions" ON public.moderator_permissions
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = moderator_permissions.server_id AND sm.user_id = auth.uid() AND sm.role = 'owner')
    OR public.is_admin()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = moderator_permissions.server_id AND sm.user_id = auth.uid() AND sm.role = 'owner')
    OR public.is_admin()
  );

CREATE POLICY "Moderator can read own permissions" ON public.moderator_permissions
  FOR SELECT
  USING (user_id = auth.uid());

-- Trigger: auto-create permissions row when moderator is added to server_members
CREATE OR REPLACE FUNCTION public.create_moderator_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.role = 'moderator' THEN
    INSERT INTO public.moderator_permissions (server_id, user_id)
    VALUES (NEW.server_id, NEW.user_id)
    ON CONFLICT (server_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_moderator_permissions ON public.server_members;
CREATE TRIGGER trg_create_moderator_permissions
  AFTER INSERT ON public.server_members
  FOR EACH ROW
  EXECUTE FUNCTION public.create_moderator_permissions();

-- Backfill: create permissions rows for existing moderators
INSERT INTO public.moderator_permissions (server_id, user_id)
SELECT server_id, user_id FROM public.server_members WHERE role = 'moderator'
ON CONFLICT (server_id, user_id) DO NOTHING;
