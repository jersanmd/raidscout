-- ── Migration 084: Audit Log RPC + RLS ────────────────────
-- Replaces direct table access with SECURITY DEFINER wrappers.
-- Owners & moderators can now read their server's audit log.

-- 0. Ensure id column has its BIGSERIAL default (may have been lost)
DO $$
DECLARE
  v_max BIGINT;
BEGIN
  -- Create sequence if missing
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'admin_audit_log_id_seq' AND relkind = 'S') THEN
    SELECT COALESCE(MAX(id), 0) INTO v_max FROM public.admin_audit_log;
    EXECUTE 'CREATE SEQUENCE public.admin_audit_log_id_seq START WITH ' || (v_max + 1);
  END IF;
  -- Set default
  ALTER TABLE public.admin_audit_log ALTER COLUMN id SET DEFAULT nextval('public.admin_audit_log_id_seq'::regclass);
  -- Set as owned by the column so it's dropped with the table
  ALTER SEQUENCE public.admin_audit_log_id_seq OWNED BY public.admin_audit_log.id;
END $$;

-- 1. Drop old policies
DROP POLICY IF EXISTS "Admins can read audit log" ON admin_audit_log;
DROP POLICY IF EXISTS "Authenticated users can insert audit entries" ON admin_audit_log;

-- 2. New read policy: admins (all servers) + owners/moderators (their server only)
DROP POLICY IF EXISTS "Admins and server staff can read audit log" ON admin_audit_log;
CREATE POLICY "Admins and server staff can read audit log" ON admin_audit_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    OR
    EXISTS (
      SELECT 1 FROM server_members
      WHERE server_id = admin_audit_log.server_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'moderator')
    )
  );

-- 3. New write policy: only admins can insert directly
DROP POLICY IF EXISTS "Only admins can insert audit entries" ON admin_audit_log;
CREATE POLICY "Only admins can insert audit entries" ON admin_audit_log
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- 4. SECURITY DEFINER wrapper for non-admin writes (owners, moderators, viewers)
CREATE OR REPLACE FUNCTION write_audit_entry(
  p_action TEXT,
  p_server_id UUID,
  p_target_type TEXT DEFAULT NULL,
  p_target_id TEXT DEFAULT NULL,
  p_details JSONB DEFAULT '{}',
  p_viewer_key TEXT DEFAULT NULL
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id BIGINT;
BEGIN
  -- Verify the caller is authorized for this server
  -- Admins can write for any server
  -- Server members (owner/moderator) can write for their server
  -- Viewers: allowed if p_viewer_key is provided (caller is the viewer)
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.server_members
    WHERE server_id = p_server_id
      AND user_id = auth.uid()
  ) AND p_viewer_key IS NULL THEN
    RAISE EXCEPTION 'You are not authorized to write audit entries for this server';
  END IF;

  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, server_id, details, viewer_key)
  VALUES (auth.uid(), p_action, p_target_type, p_target_id, p_server_id, p_details, p_viewer_key)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 5. Read RPC: simple SQL function — RLS policies handle access control
CREATE OR REPLACE FUNCTION get_audit_log(
  p_server_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 200,
  p_cursor TIMESTAMPTZ DEFAULT NULL,
  p_action_filter TEXT DEFAULT NULL
) RETURNS TABLE (
  id BIGINT,
  actor_id UUID,
  actor_email TEXT,
  action TEXT,
  target_type TEXT,
  target_id TEXT,
  details JSONB,
  server_id UUID,
  viewer_key TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
AS $$
  SELECT
    a.id,
    a.actor_id,
    NULL::text AS actor_email,
    a.action,
    a.target_type,
    a.target_id,
    a.details,
    a.server_id,
    a.viewer_key,
    a.created_at
  FROM admin_audit_log a
  WHERE (p_server_id IS NULL OR a.server_id = p_server_id)
    AND (p_cursor IS NULL OR a.created_at < p_cursor)
    AND (p_action_filter IS NULL OR a.action = p_action_filter)
  ORDER BY a.created_at DESC, a.id DESC
  LIMIT p_limit;
$$;

-- 7. Index for audit log queries
CREATE INDEX IF NOT EXISTS idx_audit_server_created ON public.admin_audit_log(server_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON public.admin_audit_log(action);

-- 6. Force-spawn RPC: add admin auth check
CREATE OR REPLACE FUNCTION public.admin_forcespawn_all(p_server_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INT;
BEGIN
  -- Auth check: only admins
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Only admins can force-spawn bosses';
  END IF;

  DELETE FROM public.boss_spawn_overrides WHERE server_id = p_server_id;

  WITH forced AS (
    INSERT INTO public.boss_spawn_overrides (server_id, boss_id, spawn_window_start, spawn_window_end, is_initial_spawn)
    SELECT
      p_server_id,
      b.id,
      NOW(),
      NOW() + (COALESCE(b.spawn_window_hours, 1) || ' hours')::INTERVAL,
      FALSE
    FROM public.bosses b
    WHERE b.server_id = p_server_id AND b.spawn_type = 'fixed_hours'
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM forced;

  RETURN v_count;
END;
$$;
