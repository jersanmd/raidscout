-- Add staff authorization inside the write RPCs.
--
-- The previous migration revoked anon EXECUTE, closing UNAUTHENTICATED access.
-- This closes the remaining half: these functions are SECURITY DEFINER (so they
-- bypass RLS) and accept a server_id / row id without ever checking that the
-- caller belongs to that server. Any authenticated user of server A could
-- create, edit or delete bosses, activities, static parties, member stats and
-- finalized leaderboard snapshots on server B.
--
-- Each function now requires owner/moderator on the server the target belongs
-- to, matching the gate mark_item_for_bid and resolve_auction already use.
-- service_role bypasses, so the Discord bot and cron paths are unaffected.
--
-- Where the server_id is not a parameter it is derived from the target row
-- (activity, boss, member, party). A missing target raises rather than silently
-- doing nothing, so a bad id is visible instead of looking like success.
--
-- SIGNATURE DISCIPLINE: every CREATE OR REPLACE below reproduces the deployed
-- argument list byte-for-byte, defaults included (verified against
-- pg_get_function_arguments). Changing a parameter's order or type would create
-- an ADDITIONAL overload rather than replacing the function -- exactly the fault
-- that broke activity creation for two months. Parameter renames are caught by
-- Postgres itself ("cannot change name of input parameter"), but order and type
-- are not, so they were checked by hand.
--
-- create_moderator_permissions is deliberately absent: it is a TRIGGER function
-- on server_members (zero args, uses NEW), not a callable RPC, so it has no
-- caller to authorize. Verified still firing after the anon revoke.

-- ── helper: staff-or-service_role gate ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.assert_server_staff(p_server_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN RETURN; END IF;
  IF p_server_id IS NULL THEN
    RAISE EXCEPTION 'Target not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.server_members sm
    WHERE sm.server_id = p_server_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'moderator')
  ) THEN
    RAISE EXCEPTION 'Staff access required';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assert_server_staff(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_server_staff(UUID) TO authenticated;

-- ── creates: server_id is a parameter ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_custom_activity(
  p_server_id uuid, p_name text, p_schedule_type text,
  p_schedule jsonb DEFAULT NULL::jsonb,
  p_points_per_participant integer DEFAULT 1,
  p_party_size integer DEFAULT NULL::integer,
  p_category text DEFAULT NULL::text,
  p_tags text[] DEFAULT '{}'::text[],
  p_duration_minutes integer DEFAULT NULL::integer,
  p_image_url text DEFAULT NULL::text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_id UUID;
BEGIN
  PERFORM public.assert_server_staff(p_server_id);
  INSERT INTO public.activities (
    server_id, template_id, name, schedule_type, schedule,
    points_per_participant, party_size, is_enabled, is_custom,
    category, tags, duration_minutes, image_url
  )
  VALUES (
    p_server_id, NULL, p_name, p_schedule_type, p_schedule,
    p_points_per_participant, p_party_size, true, true,
    p_category, p_tags, p_duration_minutes, p_image_url
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_custom_boss(
  p_server_id uuid, p_name text, p_spawn_type text,
  p_respawn_hours integer DEFAULT NULL::integer,
  p_schedule jsonb DEFAULT NULL::jsonb,
  p_is_recurring boolean DEFAULT true,
  p_boss_points integer DEFAULT 1,
  p_category text DEFAULT NULL::text,
  p_tags text[] DEFAULT '{}'::text[],
  p_image_url text DEFAULT NULL::text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_id UUID; v_pts INTEGER;
BEGIN
  PERFORM public.assert_server_staff(p_server_id);
  v_pts := COALESCE(p_boss_points, 1);
  INSERT INTO public.bosses (server_id, template_id, name, spawn_type, respawn_hours, schedule, is_recurring, is_enabled, is_custom, boss_points, points, category, tags, image_url)
  VALUES (p_server_id, NULL, p_name, p_spawn_type, p_respawn_hours, p_schedule, p_is_recurring, true, true, v_pts, v_pts, p_category, p_tags, p_image_url)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_static_party(
  p_server_id uuid, p_name text,
  p_guild_id uuid DEFAULT NULL::uuid,
  p_boss_id uuid DEFAULT NULL::uuid,
  p_activity_id uuid DEFAULT NULL::uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_id UUID;
BEGIN
  PERFORM public.assert_server_staff(p_server_id);
  INSERT INTO public.static_parties (server_id, guild_id, name, boss_id, activity_id)
  VALUES (p_server_id, p_guild_id, p_name, p_boss_id, p_activity_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_leaderboard_snapshot(
  p_snapshot_id uuid, p_server_id uuid, p_period text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reset_key TEXT;
  v_prev_reset TIMESTAMPTZ;
  v_snap_finalized TIMESTAMPTZ;
BEGIN
  PERFORM public.assert_server_staff(p_server_id);

  SELECT finalized_at INTO v_snap_finalized
  FROM public.leaderboard_snapshots
  WHERE id = p_snapshot_id;

  IF NOT FOUND THEN RETURN; END IF;

  v_reset_key := CASE WHEN p_period LIKE 'weekly:%'
    THEN 'leaderboard_reset_at:' || replace(p_period, 'weekly:', '')
    ELSE 'leaderboard_reset_at'
  END;

  SELECT finalized_at INTO v_prev_reset
  FROM public.leaderboard_snapshots
  WHERE server_id = p_server_id
    AND period = p_period
    AND finalized_at < v_snap_finalized
  ORDER BY finalized_at DESC
  LIMIT 1;

  DELETE FROM public.leaderboard_snapshots WHERE id = p_snapshot_id;

  IF v_prev_reset IS NOT NULL THEN
    INSERT INTO public.app_settings (key, value, server_id)
    VALUES (v_reset_key, v_prev_reset::text, p_server_id)
    ON CONFLICT (key, server_id) DO UPDATE SET value = EXCLUDED.value;
  ELSE
    DELETE FROM public.app_settings WHERE key = v_reset_key AND server_id = p_server_id;
  END IF;
END;
$$;

-- ── updates/deletes: server_id derived from the target row ──────────────────

CREATE OR REPLACE FUNCTION public.update_custom_activity(
  p_activity_id uuid, p_name text, p_schedule_type text, p_schedule jsonb,
  p_duration_minutes integer, p_points_per_participant integer,
  p_party_size integer, p_category text, p_tags text[], p_image_url text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.assert_server_staff(
    (SELECT a.server_id FROM public.activities a WHERE a.id = p_activity_id));
  UPDATE public.activities SET
    name = p_name, schedule_type = p_schedule_type,
    schedule = p_schedule, duration_minutes = p_duration_minutes,
    points_per_participant = p_points_per_participant,
    party_size = p_party_size, category = p_category,
    tags = p_tags, image_url = p_image_url
  WHERE id = p_activity_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_custom_boss(
  p_boss_id uuid, p_name text, p_spawn_type text, p_respawn_hours numeric,
  p_schedule jsonb, p_is_recurring boolean, p_boss_points integer,
  p_category text, p_tags text[], p_image_url text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.assert_server_staff(
    (SELECT b.server_id FROM public.bosses b WHERE b.id = p_boss_id));
  UPDATE public.bosses SET
    name = p_name, spawn_type = p_spawn_type,
    respawn_hours = p_respawn_hours, schedule = p_schedule,
    is_recurring = p_is_recurring, boss_points = p_boss_points,
    category = p_category, tags = p_tags,
    image_url = p_image_url
  WHERE id = p_boss_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_member_stats(
  p_member_id uuid, p_combat_power integer, p_class text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.assert_server_staff(
    (SELECT m.server_id FROM public.members m WHERE m.id = p_member_id));
  UPDATE public.members SET combat_power = p_combat_power, class = p_class
  WHERE id = p_member_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_static_party(p_party_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.assert_server_staff(
    (SELECT sp.server_id FROM public.static_parties sp WHERE sp.id = p_party_id));
  DELETE FROM public.static_parties WHERE id = p_party_id;
END;
$$;
