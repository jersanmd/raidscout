-- Phase 0a of viewer-link access control: close the holes that make any
-- per-server viewer setting meaningless, without changing what any
-- legitimate user sees.
--
-- Verified on production 2026-10-04: the publishable (anon) key -- which ships
-- in the browser bundle -- could call every function below with no check.
-- get_all_users returned every account's email; get_server_viewer_key handed
-- out any server's viewer link; toggle_viewer_can_* let anyone flip a
-- server's viewer permissions; restore_server undeleted any server;
-- log_server_action forged audit rows. Supabase's default privileges grant
-- anon and PUBLIC EXECUTE on every new function in public, so "granted to
-- authenticated" in an old migration never meant anon was excluded.
--
-- Guards follow each function's real callers (traced in src/, scripts/bot,
-- supabase/functions, other SQL functions and cron):
--   * admin-only where only the Admin Panel calls it;
--   * get_user_id_by_email stays usable by server owners (they add moderators
--     by email) -- admin-only would break that;
--   * get_user_email, log_server_action and log_admin_action have no direct
--     caller; they are reached only from SECURITY DEFINER functions owned by
--     postgres, so revoking EXECUTE from client roles leaves those paths
--     working. The audit trigger chain also gets a pinned search_path: it
--     named its tables and functions without a schema and broke under callers
--     pinned to an empty search_path, like the rewritten viewer toggles;
--   * get_admin_user_ids is read by every owner/moderator's Server Settings
--     to hide the platform admin from member lists: authenticated only;
--   * viewer-link functions: owner/moderator via assert_server_staff, plus
--     platform admins and the servers.owner_id holder -- one live server's
--     owner has no server_members row, and the admin is a member of only two.
--
-- Also rewrites the nine RLS policies that read servers.viewer_key as the
-- invoking role, so a later column-level revoke of viewer_key from anon (0b)
-- cannot break anon reads of members/items/gear/DKP. Same results today: all
-- 100 servers have a viewer key, and the three dropped policies sit next to a
-- USING (true) sibling on the same table.
--
-- SIGNATURE DISCIPLINE: every CREATE OR REPLACE keeps the deployed argument
-- names and types (verified with pg_get_function_identity_arguments), so it
-- replaces rather than overloads. CREATE OR REPLACE keeps the old ACL, hence
-- the explicit REVOKE/GRANT after each.

-- ── shared guard ──────────────────────────────────────────────────────────────

-- Errors unless the caller may manage this server's viewer link.
CREATE OR REPLACE FUNCTION public.assert_viewer_link_manager(p_server_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.is_admin()
     OR EXISTS (SELECT 1 FROM public.servers s WHERE s.id = p_server_id AND s.owner_id = auth.uid()) THEN
    RETURN;
  END IF;
  -- owner/moderator membership; lets service_role through
  PERFORM public.assert_server_staff(p_server_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.assert_viewer_link_manager(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_viewer_link_manager(uuid) TO authenticated, service_role;

-- ── admin-only (Admin Panel is the only caller) ───────────────────────────────

CREATE OR REPLACE FUNCTION public.get_all_users()
RETURNS TABLE(user_id uuid, email text, email_confirmed_at timestamp with time zone, role text, created_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    au.id AS user_id,
    au.email::text,
    au.email_confirmed_at,
    COALESCE(ur.role, 'member') AS role,
    au.created_at
  FROM auth.users au
  LEFT JOIN public.user_roles ur ON ur.user_id = au.id
  ORDER BY au.created_at DESC;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_all_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_all_users() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_all_admin_roles()
RETURNS TABLE(user_id uuid, role text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT sm.user_id, sm.role
  FROM public.server_members sm
  WHERE sm.role IN ('owner', 'moderator')
    AND (public.is_admin() OR coalesce(auth.role(), '') = 'service_role');
$$;
REVOKE EXECUTE ON FUNCTION public.get_all_admin_roles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_all_admin_roles() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_all_servers_with_counts()
RETURNS TABLE(id uuid, name text, owner_id uuid, created_at timestamp with time zone, member_count bigint, raid_member_count bigint, game_name text, game_icon_url text, subscription_ends_at timestamp with time zone, trial_ends_at timestamp with time zone)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    s.id,
    s.name,
    s.owner_id,
    s.created_at,
    (SELECT COUNT(*) FROM public.server_members sm WHERE sm.server_id = s.id) AS member_count,
    (SELECT COUNT(*) FROM public.members m WHERE m.server_id = s.id) AS raid_member_count,
    g.name AS game_name,
    g.icon_url AS game_icon_url,
    s.subscription_ends_at,
    s.trial_ends_at
  FROM public.servers s
  LEFT JOIN public.games g ON g.id = s.game_id
  WHERE s.deleted_at IS NULL
    AND (public.is_admin() OR coalesce(auth.role(), '') = 'service_role')
  ORDER BY s.created_at DESC;
$$;
REVOKE EXECUTE ON FUNCTION public.get_all_servers_with_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_all_servers_with_counts() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_user_servers(user_id_input uuid)
RETURNS TABLE(server_id uuid, server_name text, role text, created_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    s.id AS server_id,
    s.name AS server_name,
    sm.role,
    s.created_at
  FROM public.server_members sm
  JOIN public.servers s ON s.id = sm.server_id
  WHERE sm.user_id = user_id_input
  ORDER BY s.created_at DESC;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_user_servers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_servers(uuid) TO authenticated, service_role;

-- get_plan_usage and get_infra_metrics: guard added, bodies otherwise as deployed.
CREATE OR REPLACE FUNCTION public.get_plan_usage()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_db_size_bytes BIGINT;
  v_db_size TEXT;
  v_cache_ratio NUMERIC;
  v_active_conns INT;
  v_idle_conns INT;
  v_total_conns INT;
  v_max_conns INT;
  v_auth_users INT;
  v_active_users_30d INT;
  v_storage_bytes BIGINT;
  v_storage_pretty TEXT;
  v_storage_objects INT;
  v_total_rows BIGINT;
  v_table_count INT;
BEGIN
  IF NOT public.is_admin() AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  -- Database size
  SELECT pg_database_size(current_database()) INTO v_db_size_bytes;
  v_db_size := pg_size_pretty(v_db_size_bytes);

  -- Cache hit ratio
  SELECT ROUND((sum(heap_blks_hit)::numeric / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0)) * 100, 1)
    INTO v_cache_ratio FROM pg_statio_user_tables;

  -- Connections
  SELECT count(*) INTO v_active_conns FROM pg_stat_activity WHERE state = 'active';
  SELECT count(*) INTO v_idle_conns FROM pg_stat_activity WHERE state = 'idle';
  SELECT count(*) INTO v_total_conns FROM pg_stat_activity;
  SELECT setting::int INTO v_max_conns FROM pg_settings WHERE name = 'max_connections';

  -- Auth users
  BEGIN
    SELECT count(*) INTO v_auth_users FROM auth.users;
    SELECT count(*) INTO v_active_users_30d
      FROM auth.users WHERE last_sign_in_at > now() - interval '30 days';
  EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
    v_auth_users := 0;
    v_active_users_30d := 0;
  END;

  -- Storage (from storage schema — file size is in metadata JSON)
  BEGIN
    SELECT COALESCE(sum(COALESCE((o.metadata->>'size')::bigint, 0)), 0)
      INTO v_storage_bytes FROM storage.objects o;
  EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
    v_storage_bytes := 0;
  END;

  v_storage_pretty := pg_size_pretty(COALESCE(v_storage_bytes, 0));

  BEGIN
    SELECT count(*) INTO v_storage_objects FROM storage.objects;
  EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
    v_storage_objects := 0;
  END;

  -- Total rows across all user tables
  SELECT COALESCE(sum(n_live_tup), 0) INTO v_total_rows FROM pg_stat_user_tables;
  SELECT count(*) INTO v_table_count FROM pg_stat_user_tables;

  RETURN jsonb_build_object(
    'db_size', v_db_size,
    'db_size_bytes', v_db_size_bytes,
    'cache_hit_ratio', v_cache_ratio,
    'active_connections', v_active_conns,
    'idle_connections', v_idle_conns,
    'total_connections', v_total_conns,
    'max_connections', v_max_conns,
    'auth_users', v_auth_users,
    'active_auth_users_30d', v_active_users_30d,
    'storage_size_bytes', v_storage_bytes,
    'storage_size_pretty', v_storage_pretty,
    'storage_objects', v_storage_objects,
    'total_rows', v_total_rows,
    'table_count', v_table_count,
    'timestamp', now()
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_plan_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_plan_usage() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_infra_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_admin() AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'db_size_bytes', pg_database_size(current_database()),
    'db_size_pretty', pg_size_pretty(pg_database_size(current_database())),
    'table_count', (SELECT count(*) FROM pg_stat_user_tables WHERE schemaname = 'public'),
    'table_counts', (
      SELECT jsonb_object_agg(relname, n_live_tup)
      FROM pg_stat_user_tables
      WHERE schemaname = 'public'
        AND relname IN ('servers', 'members', 'death_records', 'attendance_records', 'spawn_notifications', 'audit_log', 'items', 'bosses')
    ),
    'active_connections', (SELECT count(*) FROM pg_stat_activity WHERE state = 'active'),
    'total_connections', (SELECT count(*) FROM pg_stat_activity)
  ) INTO result;

  RETURN result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_infra_metrics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_infra_metrics() TO authenticated, service_role;

-- ── owners keep adding moderators by email ────────────────────────────────────

-- Returns NULL (the client shows "Could not find user") unless the caller is an
-- admin or owns a server. Still enumerable by anyone who creates a server --
-- a server-scoped add-moderator RPC is the full fix, later.
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(user_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.id FROM auth.users u
  WHERE u.email = user_email
    AND (public.is_admin()
         OR coalesce(auth.role(), '') = 'service_role'
         OR EXISTS (SELECT 1 FROM public.servers s WHERE s.owner_id = auth.uid())
         OR EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.user_id = auth.uid() AND sm.role = 'owner'))
  LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.get_user_id_by_email(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO authenticated, service_role;

-- ── internal helpers: no client caller ────────────────────────────────────────

-- Reached only via get_audit_log (SECURITY DEFINER, owner postgres), which
-- applies its own owner/moderator/admin check.
REVOKE EXECUTE ON FUNCTION public.get_user_email(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_email(uuid) TO service_role;

-- Reached only from the audit trigger functions and transfer_server_ownership
-- (all SECURITY DEFINER, owner postgres). Open to clients, they let anyone
-- forge audit rows on any server.
REVOKE EXECUTE ON FUNCTION public.log_server_action(uuid, text, text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_server_action(uuid, text, text, text, jsonb, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.log_admin_action(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_admin_action(text, text, text, jsonb) TO service_role;

-- Hides the platform admin from owners'/moderators' member lists: any
-- signed-in user, not anon.
REVOKE EXECUTE ON FUNCTION public.get_admin_user_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_user_ids() TO authenticated, service_role;

-- ── audit chain: resolve names the same way for every caller ──────────────────

-- These SECURITY DEFINER trigger and log functions name log_server_action,
-- log_admin_action, admin_audit_log and bosses without a schema and have no
-- search_path of their own, so they resolve through the CALLER's. Under a
-- caller pinned to search_path = '' -- as the viewer toggles below now are --
-- the servers UPDATE trigger fails with "function log_server_action does not
-- exist" and rolls back the toggle. Pinning keeps today's resolution (public)
-- for every caller; pg_temp last so a definer function can't be steered by a
-- caller's temporary objects.
ALTER FUNCTION public.audit_server_update() SET search_path = public, pg_temp;
ALTER FUNCTION public.audit_server_delete() SET search_path = public, pg_temp;
ALTER FUNCTION public.audit_member_insert() SET search_path = public, pg_temp;
ALTER FUNCTION public.audit_death_record_insert() SET search_path = public, pg_temp;
ALTER FUNCTION public.audit_user_roles_change() SET search_path = public, pg_temp;
ALTER FUNCTION public.log_server_action(uuid, text, text, text, jsonb, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.log_admin_action(text, text, text, jsonb) SET search_path = public, pg_temp;

-- ── viewer link: owner/moderator/admin only ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_server_viewer_key(s_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key text;
BEGIN
  PERFORM public.assert_viewer_link_manager(s_id);
  SELECT viewer_key::text INTO v_key FROM public.servers WHERE id = s_id;
  RETURN v_key;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_server_viewer_key(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_server_viewer_key(uuid) TO authenticated, service_role;

-- Moderators may now regenerate too (was owner-only via server_members, which
-- also refused the admin and the servers.owner_id-only owner).
CREATE OR REPLACE FUNCTION public.regenerate_viewer_key(s_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_key uuid;
BEGIN
  PERFORM public.assert_viewer_link_manager(s_id);
  new_key := gen_random_uuid();
  UPDATE public.servers SET viewer_key = new_key WHERE id = s_id;
  RETURN new_key;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.regenerate_viewer_key(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regenerate_viewer_key(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.toggle_viewer_can_edit(p_server_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_new_val boolean;
BEGIN
  PERFORM public.assert_viewer_link_manager(p_server_id);
  UPDATE public.servers
  SET viewer_can_edit = NOT COALESCE(viewer_can_edit, false)
  WHERE id = p_server_id
  RETURNING viewer_can_edit INTO v_new_val;
  RETURN v_new_val;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.toggle_viewer_can_edit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_viewer_can_edit(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.toggle_viewer_can_mark_died(p_server_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_new_val boolean;
BEGIN
  PERFORM public.assert_viewer_link_manager(p_server_id);
  UPDATE public.servers
  SET viewer_can_mark_died = NOT COALESCE(viewer_can_mark_died, false)
  WHERE id = p_server_id
  RETURNING viewer_can_mark_died INTO v_new_val;
  RETURN v_new_val;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.toggle_viewer_can_mark_died(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_viewer_can_mark_died(uuid) TO authenticated, service_role;

-- ── restore_server: the owner or an admin ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.restore_server(p_server_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (public.is_admin()
          OR coalesce(auth.role(), '') = 'service_role'
          OR EXISTS (SELECT 1 FROM public.servers s WHERE s.id = p_server_id AND s.owner_id = auth.uid())
          OR EXISTS (SELECT 1 FROM public.server_members sm
                     WHERE sm.server_id = p_server_id AND sm.user_id = auth.uid() AND sm.role = 'owner')) THEN
    RAISE EXCEPTION 'Only the server owner or an admin can restore this server' USING ERRCODE = '42501';
  END IF;
  UPDATE public.servers SET deleted_at = NULL WHERE id = p_server_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.restore_server(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_server(uuid) TO authenticated, service_role;

-- ── policies that read servers.viewer_key as the invoking role ────────────────

-- A policy subquery on servers runs with the caller's column privileges, so
-- once anon loses SELECT on viewer_key (0b) these would fail every anon read
-- of the table with "permission denied for table servers". The helper reads
-- it as its owner instead, with the same answer.
CREATE SCHEMA IF NOT EXISTS private;  -- not exposed through the API
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.server_has_viewer_link(p_server_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.servers s WHERE s.id = p_server_id AND s.viewer_key IS NOT NULL);
$$;
REVOKE EXECUTE ON FUNCTION private.server_has_viewer_link(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.server_has_viewer_link(uuid) TO anon, authenticated, service_role;

-- Redundant: each sits beside a USING (true) SELECT policy on the same table.
DROP POLICY IF EXISTS "Viewers can read members" ON public.members;
DROP POLICY IF EXISTS "Viewers can read items" ON public.items;
DROP POLICY IF EXISTS "Anon can read viewer servers" ON public.servers;

-- Member branches unchanged; viewer branches go through the helper.
ALTER POLICY "Members can read server auctions" ON public.dkp_auctions
  USING (
    EXISTS (SELECT 1 FROM public.server_members
            WHERE server_members.server_id = dkp_auctions.server_id
              AND server_members.user_id = (SELECT auth.uid()))
    OR private.server_has_viewer_link(dkp_auctions.server_id)
  );

ALTER POLICY "Members can read distributed status" ON public.dkp_distributed
  USING (
    EXISTS (SELECT 1 FROM public.dkp_auctions a JOIN public.server_members sm ON sm.server_id = a.server_id
            WHERE a.id = dkp_distributed.auction_id AND sm.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.dkp_auctions a
               WHERE a.id = dkp_distributed.auction_id AND private.server_has_viewer_link(a.server_id))
    OR EXISTS (SELECT 1 FROM public.items i JOIN public.server_members sm ON sm.server_id = i.server_id
               WHERE i.id = dkp_distributed.item_id AND sm.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.items i
               WHERE i.id = dkp_distributed.item_id AND private.server_has_viewer_link(i.server_id))
  );

ALTER POLICY "Server members can view gear catalog" ON public.gear_catalog
  USING (
    EXISTS (SELECT 1 FROM public.server_members sm
            WHERE sm.server_id = gear_catalog.server_id AND sm.user_id = auth.uid())
    OR private.server_has_viewer_link(gear_catalog.server_id)
  );

ALTER POLICY "Server members can view gear templates" ON public.gear_templates
  USING (
    EXISTS (SELECT 1 FROM public.server_members sm
            WHERE sm.server_id = gear_templates.server_id AND sm.user_id = auth.uid())
    OR private.server_has_viewer_link(gear_templates.server_id)
  );

ALTER POLICY "Server members can view gear history" ON public.gear_upgrade_history
  USING (
    EXISTS (SELECT 1 FROM public.members m JOIN public.server_members sm ON sm.server_id = m.server_id
            WHERE m.id = gear_upgrade_history.member_id AND sm.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.members m
               WHERE m.id = gear_upgrade_history.member_id AND private.server_has_viewer_link(m.server_id))
  );

ALTER POLICY "Server members can view member gear" ON public.member_gear
  USING (
    EXISTS (SELECT 1 FROM public.members m JOIN public.server_members sm ON sm.server_id = m.server_id
            WHERE m.id = member_gear.member_id AND sm.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.members m
               WHERE m.id = member_gear.member_id AND private.server_has_viewer_link(m.server_id))
  );
