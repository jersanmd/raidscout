-- 015_soft_delete_servers: Soft-delete servers instead of hard-deleting
-- Preserves all data — owner can't see deleted server, admins can restore.

ALTER TABLE public.servers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_servers_deleted_at ON public.servers(deleted_at) WHERE deleted_at IS NOT NULL;
