-- 025_member_is_active: Add is_active column for soft-disabling members
-- Disabled members are excluded from attendance, progress, gear tracking,
-- parties, and classes but their historical data is preserved.

ALTER TABLE public.members ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_members_active ON public.members(server_id, is_active);
