-- 101_boss_toggle_delete_rpc: deleted_at column + SECURITY DEFINER RPCs for boss management
-- Three boss states: Active (is_enabled=true), Disabled (is_enabled=false, deleted_at=null), Soft-deleted (is_enabled=false, deleted_at set)
-- These RPCs bypass RLS to avoid silent failures when updating bosses

-- 1. Add deleted_at column for soft-delete support
ALTER TABLE public.bosses ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2. Toggle boss enabled/disabled (does NOT touch deleted_at)
CREATE OR REPLACE FUNCTION public.toggle_boss_enabled(p_boss_id uuid, p_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.bosses SET is_enabled = p_enabled WHERE id = p_boss_id;
END;
$$;

-- 3. Soft-delete a boss: set is_enabled=false AND deleted_at=now() — hides it permanently
CREATE OR REPLACE FUNCTION public.soft_delete_boss(p_boss_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.bosses
  SET is_enabled = false, deleted_at = now()
  WHERE id = p_boss_id;
END;
$$;
