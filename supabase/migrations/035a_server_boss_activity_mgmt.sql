-- 035_server_boss_activity_mgmt.sql
-- Server owner/moderator boss & activity management
-- Adds: image_url columns, unique constraint, RLS policies, seed RPCs, server creation fallback

-- ── Schema extensions ──────────────────────────────────────
ALTER TABLE public.bosses ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Safe unique constraint: deduplicate first, then add index
DELETE FROM public.bosses WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY name, server_id ORDER BY created_at) as rn
    FROM public.bosses WHERE server_id IS NOT NULL
  ) sub WHERE rn > 1
);
CREATE UNIQUE INDEX IF NOT EXISTS bosses_name_server_unique ON public.bosses(name, server_id);

-- ── RLS: Activities INSERT/UPDATE/DELETE (server-scoped) ────
DROP POLICY IF EXISTS "Server moderators can manage activities" ON public.activities;
DROP POLICY IF EXISTS "Authenticated users can manage activities" ON public.activities;
CREATE POLICY "Server moderators can manage activities" ON public.activities
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.server_members WHERE server_id = activities.server_id AND user_id = auth.uid() AND role IN ('owner','moderator'))
  );

-- ── RLS: Bosses INSERT/UPDATE/DELETE (server-scoped) ────────
DROP POLICY IF EXISTS "Authenticated users can manage bosses" ON public.bosses;
CREATE POLICY "Server moderators can manage bosses" ON public.bosses
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.server_members WHERE server_id = bosses.server_id AND user_id = auth.uid() AND role IN ('owner','moderator'))
  );

-- ── Seed Bosses RPC (idempotent) ────────────────────────────
CREATE OR REPLACE FUNCTION public.seed_bosses_for_server(p_server_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO public.bosses (server_id, name, spawn_type, respawn_hours, schedule, is_enabled, is_custom, boss_points, points)
  VALUES
    (p_server_id, 'Venatus', 'fixed_hours', 10, NULL, true, false, 1, 1),
    (p_server_id, 'Viorent', 'fixed_hours', 10, NULL, true, false, 1, 1),
    (p_server_id, 'Ego', 'fixed_hours', 21, NULL, true, false, 1, 1),
    (p_server_id, 'Lady Dalia', 'fixed_hours', 18, NULL, true, false, 1, 1),
    (p_server_id, 'Livera', 'fixed_hours', 24, NULL, true, false, 1, 1),
    (p_server_id, 'Araneo', 'fixed_hours', 24, NULL, true, false, 1, 1),
    (p_server_id, 'Undomiel', 'fixed_hours', 24, NULL, true, false, 1, 1),
    (p_server_id, 'General Aquleus', 'fixed_hours', 29, NULL, true, false, 1, 1),
    (p_server_id, 'Amentis', 'fixed_hours', 29, NULL, true, false, 1, 1),
    (p_server_id, 'Baron', 'fixed_hours', 32, NULL, true, false, 1, 1),
    (p_server_id, 'Gareth', 'fixed_hours', 32, NULL, true, false, 1, 1),
    (p_server_id, 'Catena', 'fixed_hours', 35, NULL, true, false, 1, 1),
    (p_server_id, 'Larba', 'fixed_hours', 35, NULL, true, false, 1, 1),
    (p_server_id, 'Shuliar', 'fixed_hours', 35, NULL, true, false, 1, 1),
    (p_server_id, 'Titore', 'fixed_hours', 37, NULL, true, false, 1, 1),
    (p_server_id, 'Duplican', 'fixed_hours', 48, NULL, true, false, 1, 1),
    (p_server_id, 'Metus', 'fixed_hours', 48, NULL, true, false, 1, 1),
    (p_server_id, 'Wannitas', 'fixed_hours', 48, NULL, true, false, 1, 1),
    (p_server_id, 'Asta', 'fixed_hours', 62, NULL, true, false, 1, 1),
    (p_server_id, 'Ordo', 'fixed_hours', 62, NULL, true, false, 1, 1),
    (p_server_id, 'Secreta', 'fixed_hours', 62, NULL, true, false, 1, 1),
    (p_server_id, 'Supore', 'fixed_hours', 62, NULL, true, false, 1, 1),
    (p_server_id, 'Auraq', 'fixed_schedule', NULL, '[{"day":5,"time":"22:00"},{"day":3,"time":"21:00"}]'::jsonb, true, false, 1, 1),
    (p_server_id, 'Benji', 'fixed_schedule', NULL, '[{"day":0,"time":"21:00"}]'::jsonb, true, false, 1, 1),
    (p_server_id, 'Chaiflock', 'fixed_schedule', NULL, '[{"day":0,"time":"15:00"}]'::jsonb, true, false, 1, 1),
    (p_server_id, 'Clemantis', 'fixed_schedule', NULL, '[{"day":1,"time":"11:30"},{"day":4,"time":"19:00"}]'::jsonb, true, false, 1, 1),
    (p_server_id, 'Icaruthia', 'fixed_schedule', NULL, '[{"day":2,"time":"21:00"},{"day":5,"time":"21:00"}]'::jsonb, true, false, 1, 1),
    (p_server_id, 'Libitina', 'fixed_schedule', NULL, '[{"day":1,"time":"21:00"},{"day":6,"time":"21:00"}]'::jsonb, true, false, 1, 1),
    (p_server_id, 'Lucus', 'fixed_schedule', NULL, '[{"day":6,"time":"22:00"}]'::jsonb, true, false, 1, 1),
    (p_server_id, 'Milavy', 'fixed_schedule', NULL, '[{"day":6,"time":"15:00"}]'::jsonb, true, false, 1, 1),
    (p_server_id, 'Motti', 'fixed_schedule', NULL, '[{"day":3,"time":"19:00"},{"day":6,"time":"19:00"}]'::jsonb, true, false, 1, 1),
    (p_server_id, 'Neutro', 'fixed_schedule', NULL, '[{"day":2,"time":"19:00"},{"day":4,"time":"11:30"}]'::jsonb, true, false, 1, 1),
    (p_server_id, 'Nevaeh', 'fixed_schedule', NULL, '[{"day":0,"time":"22:00"}]'::jsonb, true, false, 1, 1),
    (p_server_id, 'Rakajeth', 'fixed_schedule', NULL, '[{"day":2,"time":"22:00"},{"day":0,"time":"19:00"}]'::jsonb, true, false, 1, 1),
    (p_server_id, 'Ringor', 'fixed_schedule', NULL, '[{"day":6,"time":"17:00"}]'::jsonb, true, false, 1, 1),
    (p_server_id, 'Roderick', 'fixed_schedule', NULL, '[{"day":5,"time":"19:00"}]'::jsonb, true, false, 1, 1),
    (p_server_id, 'Saphirus', 'fixed_schedule', NULL, '[{"day":0,"time":"17:00"},{"day":2,"time":"11:30"}]'::jsonb, true, false, 1, 1),
    (p_server_id, 'Thymele', 'fixed_schedule', NULL, '[{"day":1,"time":"19:00"},{"day":3,"time":"11:30"}]'::jsonb, true, false, 1, 1),
    (p_server_id, 'Tumier', 'fixed_schedule', NULL, '[{"day":0,"time":"19:00"}]'::jsonb, true, false, 1, 1)
  ON CONFLICT (name, server_id) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ── Seed Activities RPC (idempotent, empty for now) ──────────
CREATE OR REPLACE FUNCTION public.seed_activities_for_server(p_server_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN 0;
END;
$$;

-- ── Update create_server_with_bosses fallback ───────────────
CREATE OR REPLACE FUNCTION public.create_server_with_bosses(
  p_name TEXT,
  p_game_id UUID,
  p_seed BOOLEAN DEFAULT true,
  p_guild_name TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_server_id UUID;
  v_user_id UUID;
  v_count INTEGER;
BEGIN
  v_user_id := auth.uid();

  INSERT INTO public.servers (name, owner_id, game_id)
  VALUES (p_name, v_user_id, p_game_id)
  RETURNING id INTO v_server_id;

  INSERT INTO public.server_members (server_id, user_id, role)
  VALUES (v_server_id, v_user_id, 'owner');

  IF p_guild_name IS NOT NULL AND p_guild_name != '' THEN
    INSERT INTO public.guilds (name, server_id)
    VALUES (p_guild_name, v_server_id);
  END IF;

  IF p_seed THEN
    -- Try templates first
    INSERT INTO public.bosses (server_id, template_id, name, spawn_type, respawn_hours, schedule, is_enabled, is_custom, boss_points, points)
    SELECT v_server_id, bt.id, bt.name, bt.spawn_type, bt.respawn_hours, bt.schedule, true, false, COALESCE(bt.points, 1), COALESCE(bt.points, 1)
    FROM public.boss_templates bt
    WHERE bt.game_id = p_game_id OR p_game_id IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- Fallback to hardcoded defaults if templates yielded 0
    IF v_count = 0 THEN
      PERFORM public.seed_bosses_for_server(v_server_id);
    END IF;

    INSERT INTO public.activities (server_id, template_id, name, schedule_type, schedule, duration_minutes, points_per_participant, party_size, is_enabled, is_custom)
    SELECT v_server_id, at.id, at.name, at.schedule_type, at.schedule, at.duration_minutes, at.points_per_participant, at.party_size, true, false
    FROM public.activity_templates at
    WHERE at.game_id = p_game_id OR p_game_id IS NULL;
  END IF;

  RETURN v_server_id;
END;
$$;

-- Seed from game templates (user selects game)
CREATE OR REPLACE FUNCTION public.seed_from_game(p_server_id UUID, p_game_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_boss_count INTEGER;
  v_act_count INTEGER;
BEGIN
  INSERT INTO public.bosses (server_id, template_id, name, spawn_type, respawn_hours, schedule, is_enabled, is_custom, boss_points, points)
  SELECT p_server_id, bt.id, bt.name, bt.spawn_type, bt.respawn_hours, bt.schedule, true, false, COALESCE(bt.points, 1), COALESCE(bt.points, 1)
  FROM public.boss_templates bt
  WHERE bt.game_id = p_game_id
  ON CONFLICT (name, server_id) DO NOTHING;
  GET DIAGNOSTICS v_boss_count = ROW_COUNT;

  INSERT INTO public.activities (server_id, template_id, name, schedule_type, schedule, duration_minutes, points_per_participant, party_size, is_enabled, is_custom)
  SELECT p_server_id, at.id, at.name, at.schedule_type, at.schedule, at.duration_minutes, at.points_per_participant, at.party_size, true, false
  FROM public.activity_templates at
  WHERE at.game_id = p_game_id;
  GET DIAGNOSTICS v_act_count = ROW_COUNT;

  RETURN jsonb_build_object('b', v_boss_count, 'a', v_act_count);
END;
$$;
