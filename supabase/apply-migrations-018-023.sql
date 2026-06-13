-- ============================================================
-- COMBINED MIGRATIONS 018–023
-- Paste into: https://supabase.com/dashboard/project/oeugehqgpodzhagomeex/sql
-- ============================================================

-- ============================================================
-- 018_gear_tracking: Gear Template System — Phase 1
-- ============================================================

-- ── Gear Templates ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gear_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Default',
  slots JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(server_id, name)
);
ALTER TABLE public.gear_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Server members can view gear templates" ON public.gear_templates;
CREATE POLICY "Server members can view gear templates" ON public.gear_templates
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = gear_templates.server_id AND sm.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.servers s WHERE s.id = gear_templates.server_id AND s.viewer_key IS NOT NULL)
  );

DROP POLICY IF EXISTS "Moderators can manage gear templates" ON public.gear_templates;
CREATE POLICY "Moderators can manage gear templates" ON public.gear_templates
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = gear_templates.server_id AND sm.user_id = auth.uid())
    OR (SELECT current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = gear_templates.server_id AND sm.user_id = auth.uid())
    OR (SELECT current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role')
  );

-- ── Gear Catalog ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gear_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id UUID NOT NULL REFERENCES public.guilds(id) ON DELETE CASCADE,
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  rarity TEXT NOT NULL DEFAULT 'common' CHECK (rarity IN ('common','uncommon','rare','epic','legendary')),
  image_url TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);
ALTER TABLE public.gear_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Server members can view gear catalog" ON public.gear_catalog;
CREATE POLICY "Server members can view gear catalog" ON public.gear_catalog
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = gear_catalog.server_id AND sm.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.servers s WHERE s.id = gear_catalog.server_id AND s.viewer_key IS NOT NULL)
  );

DROP POLICY IF EXISTS "Moderators can manage gear catalog" ON public.gear_catalog;
CREATE POLICY "Moderators can manage gear catalog" ON public.gear_catalog
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = gear_catalog.server_id AND sm.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = gear_catalog.server_id AND sm.user_id = auth.uid())
  );

-- ── Member Gear ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.member_gear (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  slot_id TEXT NOT NULL,
  catalog_item_id UUID REFERENCES public.gear_catalog(id) ON DELETE SET NULL,
  enhancement_level INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE(member_id, slot_id)
);
CREATE INDEX IF NOT EXISTS idx_member_gear_member ON public.member_gear(member_id);
ALTER TABLE public.member_gear ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Server members can view member gear" ON public.member_gear;
CREATE POLICY "Server members can view member gear" ON public.member_gear
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.members m
      JOIN public.server_members sm ON sm.server_id = m.server_id
      WHERE m.id = member_gear.member_id AND sm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.members m
      JOIN public.servers s ON s.id = m.server_id
      WHERE m.id = member_gear.member_id AND s.viewer_key IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "Moderators can manage member gear" ON public.member_gear;
CREATE POLICY "Moderators can manage member gear" ON public.member_gear
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.members m
      JOIN public.server_members sm ON sm.server_id = m.server_id
      WHERE m.id = member_gear.member_id AND sm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.members m
      JOIN public.server_members sm ON sm.server_id = m.server_id
      WHERE m.id = member_gear.member_id AND sm.user_id = auth.uid()
    )
  );

-- ── Gear Upgrade History ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gear_upgrade_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  slot_id TEXT NOT NULL,
  old_item_id UUID REFERENCES public.gear_catalog(id) ON DELETE SET NULL,
  new_item_id UUID REFERENCES public.gear_catalog(id) ON DELETE SET NULL,
  old_enhancement INT,
  new_enhancement INT,
  changed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gear_history_member ON public.gear_upgrade_history(member_id, created_at DESC);
ALTER TABLE public.gear_upgrade_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Server members can view gear history" ON public.gear_upgrade_history;
CREATE POLICY "Server members can view gear history" ON public.gear_upgrade_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.members m
      JOIN public.server_members sm ON sm.server_id = m.server_id
      WHERE m.id = gear_upgrade_history.member_id AND sm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.members m
      JOIN public.servers s ON s.id = m.server_id
      WHERE m.id = gear_upgrade_history.member_id AND s.viewer_key IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "Moderators can insert gear history" ON public.gear_upgrade_history;
CREATE POLICY "Moderators can insert gear history" ON public.gear_upgrade_history
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.members m
      JOIN public.server_members sm ON sm.server_id = m.server_id
      WHERE m.id = gear_upgrade_history.member_id AND sm.user_id = auth.uid()
    )
  );

-- ── RPC: Get gear summary for all members in a server ──────
CREATE OR REPLACE FUNCTION public.get_gear_summary(p_server_id UUID)
RETURNS TABLE(
  member_id UUID,
  gear_score INT,
  slots_filled INT,
  total_slots INT,
  completion_pct NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH template AS (
    SELECT slots
    FROM public.gear_templates
    WHERE server_id = p_server_id
    ORDER BY created_at ASC
    LIMIT 1
  ),
  slot_count AS (
    SELECT COALESCE(SUM((jsonb_array_length(cat->'slots'))::int), 0) AS total
    FROM template t,
    jsonb_array_elements(t.slots) cat
  ),
  gear_data AS (
    SELECT
      mg.member_id,
      COUNT(*)::int AS slots_filled,
      COALESCE(SUM(
        CASE WHEN gc.rarity = 'legendary' THEN 10
             WHEN gc.rarity = 'epic' THEN 5
             WHEN gc.rarity = 'rare' THEN 3
             WHEN gc.rarity = 'uncommon' THEN 2
             ELSE 1
        END + mg.enhancement_level
      ), 0)::int AS gear_score
    FROM public.member_gear mg
    JOIN public.members m ON m.id = mg.member_id
    LEFT JOIN public.gear_catalog gc ON gc.id = mg.catalog_item_id
    WHERE m.server_id = p_server_id
    GROUP BY mg.member_id
  )
  SELECT
    m.id AS member_id,
    COALESCE(gd.gear_score, 0) AS gear_score,
    COALESCE(gd.slots_filled, 0) AS slots_filled,
    sc.total AS total_slots,
    CASE WHEN sc.total > 0
      THEN ROUND(COALESCE(gd.slots_filled, 0)::numeric / sc.total * 100, 1)
      ELSE 0
    END AS completion_pct
  FROM public.members m
  CROSS JOIN slot_count sc
  LEFT JOIN gear_data gd ON gd.member_id = m.id
  WHERE m.server_id = p_server_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_gear_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_gear_summary(UUID) TO anon;


-- ============================================================
-- 019_crowdsourced_catalog: Cross-server item catalog
-- ============================================================

ALTER TABLE public.servers ADD COLUMN IF NOT EXISTS game TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS game TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS created_by_username TEXT;

ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_server_id_name_key;
ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_game_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_items_game_name ON public.items(game, name) WHERE game IS NOT NULL;

CREATE OR REPLACE FUNCTION public.search_items_by_game(p_game TEXT, p_query TEXT DEFAULT NULL)
RETURNS TABLE(
  id UUID,
  name TEXT,
  game TEXT,
  image_url TEXT,
  description TEXT,
  rarity TEXT,
  created_by_username TEXT,
  created_at TIMESTAMPTZ,
  server_count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    i.id,
    i.name,
    i.game,
    i.image_url,
    i.description,
    i.rarity,
    i.created_by_username,
    i.created_at,
    (SELECT COUNT(DISTINCT d.server_id) FROM public.distributions d WHERE d.item_id = i.id) AS server_count
  FROM public.items i
  WHERE i.game = p_game
    AND (p_query IS NULL OR i.name ILIKE '%' || p_query || '%')
  ORDER BY i.name;
$$;

GRANT EXECUTE ON FUNCTION public.search_items_by_game(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_items_by_game(TEXT, TEXT) TO anon;

-- RLS updates for items
DROP POLICY IF EXISTS "Server members can read items" ON public.items;
DROP POLICY IF EXISTS "Server moderators can insert items" ON public.items;
DROP POLICY IF EXISTS "Server moderators can update items" ON public.items;
DROP POLICY IF EXISTS "Server moderators can delete items" ON public.items;
DROP POLICY IF EXISTS "Members can read server or game items" ON public.items;

CREATE POLICY "Members can read server or game items" ON public.items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = items.server_id AND sm.user_id = auth.uid())
    OR (items.game IS NOT NULL)
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Moderators can manage items" ON public.items;

CREATE POLICY "Moderators can manage items" ON public.items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = items.server_id AND sm.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = items.server_id AND sm.user_id = auth.uid())
  );

-- Backfill game on existing items
UPDATE public.items i
SET game = s.game
FROM public.servers s
WHERE i.server_id = s.id
  AND s.game IS NOT NULL
  AND i.game IS NULL;


-- ============================================================
-- 020_item_catalog_structure: Categories, subcategories, rarities
-- ============================================================

ALTER TABLE public.items ALTER COLUMN server_id DROP NOT NULL;
ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_rarity_check;

CREATE TABLE IF NOT EXISTS public.item_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES public.item_categories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_item_categories_game ON public.item_categories(game);
CREATE UNIQUE INDEX IF NOT EXISTS idx_item_categories_game_name_null_parent
  ON public.item_categories(game, name) WHERE parent_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_item_categories_game_parent_name
  ON public.item_categories(game, parent_id, name) WHERE parent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.item_rarities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#71717a',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(game, name)
);
CREATE INDEX IF NOT EXISTS idx_item_rarities_game ON public.item_rarities(game);

ALTER TABLE public.items ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.item_categories(id) ON DELETE SET NULL;

ALTER TABLE public.item_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read item categories" ON public.item_categories;
CREATE POLICY "Anyone can read item categories" ON public.item_categories
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can manage item categories" ON public.item_categories;
CREATE POLICY "Admins can manage item categories" ON public.item_categories
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

ALTER TABLE public.item_rarities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read item rarities" ON public.item_rarities;
CREATE POLICY "Anyone can read item rarities" ON public.item_rarities
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can manage item rarities" ON public.item_rarities;
CREATE POLICY "Admins can manage item rarities" ON public.item_rarities
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can manage catalog items" ON public.items;
CREATE POLICY "Admins can manage catalog items" ON public.items
  FOR ALL
  USING (server_id IS NULL AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (server_id IS NULL AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Seed default rarities
INSERT INTO public.item_rarities (game, name, color, sort_order)
SELECT g.slug, r.name, r.color, r.sort_order
FROM public.games g
CROSS JOIN (
  VALUES
    ('Common',    '#71717a', 1),
    ('Uncommon',  '#10b981', 2),
    ('Rare',      '#0ea5e9', 3),
    ('Epic',      '#8b5cf6', 4),
    ('Legendary', '#f59e0b', 5),
    ('Mythic',    '#ef4444', 6)
) AS r(name, color, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.item_rarities ir WHERE ir.game = g.slug
);


-- ============================================================
-- 021_set_game_slug_on_server_create: Update RPC
-- ============================================================

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
  v_guild_id UUID;
  v_guild_count INTEGER;
BEGIN
  v_user_id := auth.uid();

  INSERT INTO public.servers (name, owner_id, game_id, game)
  VALUES (p_name, v_user_id, p_game_id, (SELECT slug FROM public.games WHERE id = p_game_id))
  RETURNING id INTO v_server_id;

  INSERT INTO public.server_members (server_id, user_id, role)
  VALUES (v_server_id, v_user_id, 'owner');

  IF p_guild_name IS NOT NULL AND p_guild_name != '' THEN
    INSERT INTO public.guilds (name, server_id)
    VALUES (p_guild_name, v_server_id);
  END IF;

  IF p_seed THEN
    INSERT INTO public.bosses (server_id, template_id, name, spawn_type, respawn_hours, schedule, is_enabled, is_custom, boss_points, points)
    SELECT v_server_id, bt.id, bt.name, bt.spawn_type, bt.respawn_hours, bt.schedule, true, false, COALESCE(bt.points, 1), COALESCE(bt.points, 1)
    FROM public.boss_templates bt
    WHERE bt.game_id = p_game_id OR p_game_id IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    IF v_count = 0 THEN
      PERFORM public.seed_bosses_for_server(v_server_id);
    END IF;

    INSERT INTO public.activities (server_id, template_id, name, schedule_type, schedule, duration_minutes, points_per_participant, party_size, is_enabled, is_custom)
    SELECT v_server_id, at.id, at.name, at.schedule_type, at.schedule, at.duration_minutes, at.points_per_participant, at.party_size, true, false
    FROM public.activity_templates at
    WHERE at.game_id = p_game_id OR p_game_id IS NULL;
  END IF;

  SELECT COUNT(*) INTO v_guild_count FROM public.guilds WHERE server_id = v_server_id;
  IF v_guild_count = 1 THEN
    SELECT id INTO v_guild_id FROM public.guilds WHERE server_id = v_server_id LIMIT 1;

    INSERT INTO public.boss_guilds (boss_id, guild_id, sort_order, mode)
    SELECT b.id, v_guild_id, 1, 'rotation'
    FROM public.bosses b
    WHERE b.server_id = v_server_id
    ON CONFLICT DO NOTHING;

    INSERT INTO public.activity_guilds (activity_id, guild_id, sort_order, mode)
    SELECT a.id, v_guild_id, 1, 'rotation'
    FROM public.activities a
    WHERE a.server_id = v_server_id
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_server_id;
END;
$$;


-- ============================================================
-- 022_gear_slots: Game-level gear slot definitions
-- ============================================================

CREATE TABLE IF NOT EXISTS public.gear_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (game, name)
);

CREATE TABLE IF NOT EXISTS public.gear_slot_subclasses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id UUID NOT NULL REFERENCES public.gear_slots(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (slot_id, name)
);

ALTER TABLE public.gear_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gear_slot_subclasses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read gear slots" ON public.gear_slots;
CREATE POLICY "Anyone can read gear slots" ON public.gear_slots
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage gear slots" ON public.gear_slots;
CREATE POLICY "Admins can manage gear slots" ON public.gear_slots
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Anyone can read gear slot subclasses" ON public.gear_slot_subclasses;
CREATE POLICY "Anyone can read gear slot subclasses" ON public.gear_slot_subclasses
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage gear slot subclasses" ON public.gear_slot_subclasses;
CREATE POLICY "Admins can manage gear slot subclasses" ON public.gear_slot_subclasses
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Seed default slots for LordNine
INSERT INTO public.gear_slots (game, name, sort_order)
VALUES
  ('lordnine', 'Helm', 1),
  ('lordnine', 'Chest', 2),
  ('lordnine', 'Gloves', 3),
  ('lordnine', 'Boots', 4),
  ('lordnine', 'Weapon', 5),
  ('lordnine', 'Necklace', 6),
  ('lordnine', 'Ring', 7),
  ('lordnine', 'Earring', 8),
  ('lordnine', 'Belt', 9),
  ('lordnine', 'Cloak', 10)
ON CONFLICT (game, name) DO NOTHING;


-- ============================================================
-- 023_gear_slot_categories: Junction table (slots ↔ categories)
-- ============================================================

DROP TABLE IF EXISTS public.gear_slot_subclasses;

CREATE TABLE IF NOT EXISTS public.gear_slot_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id UUID NOT NULL REFERENCES public.gear_slots(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.item_categories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (slot_id, category_id)
);

ALTER TABLE public.gear_slot_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read gear slot categories" ON public.gear_slot_categories;
CREATE POLICY "Anyone can read gear slot categories" ON public.gear_slot_categories
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage gear slot categories" ON public.gear_slot_categories;
CREATE POLICY "Admins can manage gear slot categories" ON public.gear_slot_categories
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
