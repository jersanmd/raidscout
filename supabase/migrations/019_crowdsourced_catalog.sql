-- 019_crowdsourced_catalog: Cross-server item catalog shared by game
--   Add game column to servers
--   Restructure items for game-scoped crowdsourced catalog
--   Add created_by_username for attribution

-- ── Add game column to servers ──
ALTER TABLE public.servers ADD COLUMN IF NOT EXISTS game TEXT;

-- ── Restructure items table ──

-- Add game and created_by_username columns
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS game TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS created_by_username TEXT;

-- Drop old unique constraint (server_id, name) and add new partial unique on (game, name)
ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_server_id_name_key;
ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_game_name_key;

-- Items with a game are deduplicated by (game, name); items without a game remain server-scoped
CREATE UNIQUE INDEX IF NOT EXISTS idx_items_game_name ON public.items(game, name) WHERE game IS NOT NULL;

-- ── RPC: Search items by game (cross-server) ──
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

-- ── RLS: Items with game are readable by all authenticated users ──
DROP POLICY IF EXISTS "Server members can read items" ON public.items;
DROP POLICY IF EXISTS "Server moderators can insert items" ON public.items;
DROP POLICY IF EXISTS "Server moderators can update items" ON public.items;
DROP POLICY IF EXISTS "Server moderators can delete items" ON public.items;

-- Readers: can see items from their server OR any game-shared item
DROP POLICY IF EXISTS "Members can read server or game items" ON public.items;

CREATE POLICY "Members can read server or game items" ON public.items
  FOR SELECT USING (
    -- Items scoped to their server
    EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = items.server_id AND sm.user_id = auth.uid())
    -- Items shared via game (cross-server)
    OR (items.game IS NOT NULL)
    -- Admins see all
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Writers: moderators can insert/update/delete items in their server
DROP POLICY IF EXISTS "Moderators can manage items" ON public.items;

CREATE POLICY "Moderators can manage items" ON public.items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = items.server_id AND sm.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = items.server_id AND sm.user_id = auth.uid())
  );

-- ── Backfill game on existing items from their server ──
UPDATE public.items i
SET game = s.game
FROM public.servers s
WHERE i.server_id = s.id
  AND s.game IS NOT NULL
  AND i.game IS NULL;
