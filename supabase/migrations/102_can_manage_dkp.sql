-- 102: Add can_manage_dkp to moderator_permissions
ALTER TABLE public.moderator_permissions ADD COLUMN IF NOT EXISTS can_manage_dkp BOOLEAN DEFAULT false;
