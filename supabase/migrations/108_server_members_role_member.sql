-- 108: Allow 'member' role in server_members for claimed users
ALTER TABLE public.server_members 
  DROP CONSTRAINT IF EXISTS server_members_role_check;

ALTER TABLE public.server_members 
  ADD CONSTRAINT server_members_role_check 
  CHECK (role IN ('owner', 'moderator', 'member'));
