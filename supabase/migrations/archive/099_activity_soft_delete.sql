-- 099_activity_soft_delete: Add deleted_at column to activities for soft-delete vs disable

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
