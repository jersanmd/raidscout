-- 100_boss_soft_delete: Add deleted_at column to bosses for soft-delete vs disable

ALTER TABLE public.bosses
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
