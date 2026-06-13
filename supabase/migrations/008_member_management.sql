-- Migration 008: Member Management & Inventory System
-- Phase 1 MVP: CP Updates, Member Notes, Item Catalog, Distribution Tracking

-- ── Add discord_user_id to members (for Discord linking) ──
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS discord_user_id TEXT;

-- ── CP Updates ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cp_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  old_cp INTEGER,
  new_cp INTEGER NOT NULL,
  screenshot_url TEXT,
  discord_user_id TEXT,
  discord_username TEXT,
  discord_message_id TEXT,         -- original Discord message for traceability
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ
);
ALTER TABLE public.cp_updates ENABLE ROW LEVEL SECURITY;

-- Index for quick lookup by member
CREATE INDEX IF NOT EXISTS idx_cp_updates_member ON public.cp_updates(member_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_cp_updates_status ON public.cp_updates(status, server_id);

-- ── Member Notes ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.member_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.member_notes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_member_notes_member ON public.member_notes(member_id, created_at DESC);

-- ── Item Catalog ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  image_url TEXT,
  description TEXT,
  rarity TEXT DEFAULT 'common' CHECK (rarity IN ('common', 'uncommon', 'rare', 'epic', 'legendary')),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(server_id, name)
);
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_items_server ON public.items(server_id, name);

-- ── Distributions ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  reason TEXT NOT NULL DEFAULT '',
  distributed_by UUID NOT NULL REFERENCES auth.users(id),
  distributed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.distributions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_distributions_member ON public.distributions(member_id, distributed_at DESC);
CREATE INDEX IF NOT EXISTS idx_distributions_item ON public.distributions(item_id, distributed_at DESC);

-- ── RLS Policies ────────────────────────────────────────────

-- CP Updates: server members can read; moderators+ can manage
CREATE POLICY "Server members can read cp_updates" ON public.cp_updates
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM server_members WHERE server_id = cp_updates.server_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Server moderators can insert cp_updates" ON public.cp_updates
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM server_members WHERE server_id = cp_updates.server_id AND user_id = auth.uid() AND role IN ('owner','moderator'))
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Server moderators can update cp_updates" ON public.cp_updates
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM server_members WHERE server_id = cp_updates.server_id AND user_id = auth.uid() AND role IN ('owner','moderator'))
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Member Notes: server members can read; moderators+ can write
CREATE POLICY "Server members can read member_notes" ON public.member_notes
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM server_members WHERE server_id = member_notes.server_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Server moderators can manage member_notes" ON public.member_notes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM server_members WHERE server_id = member_notes.server_id AND user_id = auth.uid() AND role IN ('owner','moderator'))
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM server_members WHERE server_id = member_notes.server_id AND user_id = auth.uid() AND role IN ('owner','moderator'))
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Items: server members can read; moderators+ can manage
CREATE POLICY "Server members can read items" ON public.items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM server_members WHERE server_id = items.server_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Server moderators can manage items" ON public.items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM server_members WHERE server_id = items.server_id AND user_id = auth.uid() AND role IN ('owner','moderator'))
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM server_members WHERE server_id = items.server_id AND user_id = auth.uid() AND role IN ('owner','moderator'))
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Distributions: server members can read; moderators+ can manage
CREATE POLICY "Server members can read distributions" ON public.distributions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM server_members WHERE server_id = distributions.server_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Server moderators can manage distributions" ON public.distributions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM server_members WHERE server_id = distributions.server_id AND user_id = auth.uid() AND role IN ('owner','moderator'))
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM server_members WHERE server_id = distributions.server_id AND user_id = auth.uid() AND role IN ('owner','moderator'))
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- ── Bot service_role bypass policies ────────────────────────
-- Bot uses service_role key and needs full access

-- ── Helper Functions ────────────────────────────────────────

-- Get member CP growth stats
CREATE OR REPLACE FUNCTION public.get_member_cp_growth(
  p_member_id UUID,
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  growth INTEGER,
  first_cp INTEGER,
  latest_cp INTEGER,
  update_count BIGINT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH latest AS (
    SELECT new_cp FROM public.cp_updates
    WHERE member_id = p_member_id AND status = 'approved'
    ORDER BY submitted_at DESC LIMIT 1
  ),
  baseline AS (
    SELECT new_cp FROM public.cp_updates
    WHERE member_id = p_member_id AND status = 'approved'
      AND submitted_at <= (NOW() - (p_days || ' days')::INTERVAL)
    ORDER BY submitted_at DESC LIMIT 1
  ),
  cnt AS (
    SELECT COUNT(*)::BIGINT FROM public.cp_updates
    WHERE member_id = p_member_id AND status = 'approved'
      AND submitted_at >= (NOW() - (p_days || ' days')::INTERVAL)
  )
  SELECT
    COALESCE((SELECT new_cp FROM latest), 0) - COALESCE((SELECT new_cp FROM baseline), (SELECT new_cp FROM latest), 0),
    (SELECT new_cp FROM baseline),
    (SELECT new_cp FROM latest),
    (SELECT * FROM cnt);
END;
$$;

-- Get top CP growth members for a server
CREATE OR REPLACE FUNCTION public.get_top_cp_growth(
  p_server_id UUID,
  p_days INTEGER DEFAULT 30,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  member_id UUID,
  player_name TEXT,
  growth BIGINT,
  current_cp INTEGER,
  update_count BIGINT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH latest_cps AS (
    SELECT DISTINCT ON (cu.member_id)
      cu.member_id,
      cu.player_name,
      cu.new_cp AS current_cp
    FROM public.cp_updates cu
    WHERE cu.server_id = p_server_id AND cu.status = 'approved'
    ORDER BY cu.member_id, cu.submitted_at DESC
  ),
  growth AS (
    SELECT
      cu.member_id,
      cu.player_name,
      MAX(cu.new_cp) - MIN(cu.new_cp) AS growth,
      COUNT(*)::BIGINT AS update_count
    FROM public.cp_updates cu
    WHERE cu.server_id = p_server_id
      AND cu.status = 'approved'
      AND cu.submitted_at >= (NOW() - (p_days || ' days')::INTERVAL)
    GROUP BY cu.member_id, cu.player_name
  )
  SELECT
    g.member_id,
    g.player_name,
    g.growth,
    lc.current_cp,
    g.update_count
  FROM growth g
  LEFT JOIN latest_cps lc ON lc.member_id = g.member_id
  WHERE g.growth > 0
  ORDER BY g.growth DESC
  LIMIT p_limit;
END;
$$;

-- Get item distribution stats
CREATE OR REPLACE FUNCTION public.get_item_distribution_stats(
  p_server_id UUID
)
RETURNS TABLE (
  item_id UUID,
  item_name TEXT,
  total_quantity BIGINT,
  recipient_count BIGINT,
  last_distributed TIMESTAMPTZ
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.item_id,
    i.name AS item_name,
    SUM(d.quantity)::BIGINT AS total_quantity,
    COUNT(DISTINCT d.member_id)::BIGINT AS recipient_count,
    MAX(d.distributed_at) AS last_distributed
  FROM public.distributions d
  JOIN public.items i ON i.id = d.item_id
  WHERE d.server_id = p_server_id
  GROUP BY d.item_id, i.name
  ORDER BY total_quantity DESC;
END;
$$;

-- Get top item recipients
CREATE OR REPLACE FUNCTION public.get_top_recipients(
  p_server_id UUID,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  member_id UUID,
  player_name TEXT,
  total_items BIGINT,
  unique_items BIGINT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.member_id,
    d.player_name,
    SUM(d.quantity)::BIGINT AS total_items,
    COUNT(DISTINCT d.item_id)::BIGINT AS unique_items
  FROM public.distributions d
  WHERE d.server_id = p_server_id
  GROUP BY d.member_id, d.player_name
  ORDER BY total_items DESC
  LIMIT p_limit;
END;
$$;
