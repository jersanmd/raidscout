-- 095_fix_moderator_permissions_pk: Re-establish PK and fix ON CONFLICT in RPC

-- 1. Ensure unique constraint exists on (server_id, user_id)
DO $$
BEGIN
  -- Drop and recreate PK to be safe
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'moderator_permissions_pkey'
      AND conrelid = 'public.moderator_permissions'::regclass
  ) THEN
    ALTER TABLE public.moderator_permissions DROP CONSTRAINT moderator_permissions_pkey;
  END IF;
END;
$$;

-- Remove any duplicate rows before adding PK
DELETE FROM public.moderator_permissions a
USING public.moderator_permissions b
WHERE a.ctid > b.ctid
  AND a.server_id = b.server_id
  AND a.user_id = b.user_id;

-- Add PK back
ALTER TABLE public.moderator_permissions
  ADD PRIMARY KEY (server_id, user_id);

-- 2. Recreate the RPC with the correct ON CONFLICT target
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
