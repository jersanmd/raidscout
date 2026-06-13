-- 018_gear_tracking: Gear Template System — Phase 1
--   gear_templates: server-level slot definitions
--   gear_catalog: guild-level item catalog
--   member_gear: member equipment slots
--   gear_upgrade_history: change tracking

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

-- RLS: anyone in server can read, moderators+ can manage
CREATE POLICY "Server members can view gear templates" ON public.gear_templates
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = gear_templates.server_id AND sm.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.servers s WHERE s.id = gear_templates.server_id AND s.viewer_key IS NOT NULL)
  );

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

CREATE POLICY "Server members can view gear catalog" ON public.gear_catalog
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = gear_catalog.server_id AND sm.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.servers s WHERE s.id = gear_catalog.server_id AND s.viewer_key IS NOT NULL)
  );

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
