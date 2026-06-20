-- 085: Fix get_audit_log to be SECURITY DEFINER
-- Previously this was LANGUAGE sql, which meant RLS on admin_audit_log
-- was enforced. The RLS subquery on server_members was subject to
-- server_members RLS (which only shows own rows), causing owners/moderators
-- to miss audit entries, especially with multiple Discord guilds.
-- Also handles server_id IS NULL entries for admins.

DROP FUNCTION IF EXISTS get_audit_log(UUID, INT, BIGINT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION get_audit_log(
  p_server_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 200,
  p_cursor BIGINT DEFAULT NULL,
  p_action_filter TEXT DEFAULT NULL,
  p_since TIMESTAMPTZ DEFAULT NULL,
  p_until TIMESTAMPTZ DEFAULT NULL
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Authorization: admin sees all, owner/mod sees their server, others see nothing
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    IF p_server_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.server_members
      WHERE server_id = p_server_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'moderator')
    ) THEN
      -- Authorized: owner/moderator of the requested server
      NULL;
    ELSE
      -- Not authorized: return empty set
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
    SELECT
      a.id,
      a.actor_id,
      public.get_user_email(a.actor_id) AS actor_email,
      a.action,
      a.target_type,
      a.target_id,
      a.details,
      a.server_id,
      a.viewer_key,
      a.created_at
    FROM public.admin_audit_log a
    WHERE (p_server_id IS NULL OR a.server_id = p_server_id)
      AND (p_cursor IS NULL OR a.id < p_cursor)
      AND (p_action_filter IS NULL OR a.action = p_action_filter)
      AND (p_since IS NULL OR a.created_at >= p_since)
      AND (p_until IS NULL OR a.created_at <= p_until)
    ORDER BY a.id DESC
    LIMIT p_limit;
END;
$$;
