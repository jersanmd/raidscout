-- 020_item_catalog_structure: Categories, subcategories, and custom rarities for item catalog
--   Per-game item categories with parent/child (subcategory) support
--   Per-game item rarities with custom colors
--   Add category_id to items table
--   Make server_id nullable for catalog items (NULL = game-level template)

-- ── Allow catalog items (server_id IS NULL) ──
ALTER TABLE public.items ALTER COLUMN server_id DROP NOT NULL;

-- ── Remove hardcoded rarity check (now managed by item_rarities table) ──
ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_rarity_check;

-- ── Item Categories ──
CREATE TABLE IF NOT EXISTS public.item_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES public.item_categories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.item_categories IS 'Per-game item categories with optional parent (subcategory)';

-- Index for fetching by game
CREATE INDEX IF NOT EXISTS idx_item_categories_game ON public.item_categories(game);

-- Unique constraint: within a game, category names must be unique per parent scope
-- Top-level categories (parent_id IS NULL) are unique by (game, name)
-- Subcategories (parent_id IS NOT NULL) are unique by (game, parent_id, name)
CREATE UNIQUE INDEX IF NOT EXISTS idx_item_categories_game_name_null_parent
  ON public.item_categories(game, name) WHERE parent_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_item_categories_game_parent_name
  ON public.item_categories(game, parent_id, name) WHERE parent_id IS NOT NULL;

-- ── Item Rarities ──
CREATE TABLE IF NOT EXISTS public.item_rarities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#71717a',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(game, name)
);
COMMENT ON TABLE public.item_rarities IS 'Per-game rarity tiers with colors';

CREATE INDEX IF NOT EXISTS idx_item_rarities_game ON public.item_rarities(game);

-- ── Add category_id to items ──
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.item_categories(id) ON DELETE SET NULL;

-- ── RLS: Categories readable by all authenticated, manageable by admins ──
ALTER TABLE public.item_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read item categories" ON public.item_categories;
CREATE POLICY "Anyone can read item categories" ON public.item_categories
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage item categories" ON public.item_categories;
CREATE POLICY "Admins can manage item categories" ON public.item_categories
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- ── RLS: Rarities readable by all authenticated, manageable by admins ──
ALTER TABLE public.item_rarities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read item rarities" ON public.item_rarities;
CREATE POLICY "Anyone can read item rarities" ON public.item_rarities
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage item rarities" ON public.item_rarities;
CREATE POLICY "Admins can manage item rarities" ON public.item_rarities
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- ── RLS: Admins can manage catalog items (server_id IS NULL) ──
DROP POLICY IF EXISTS "Admins can manage catalog items" ON public.items;
CREATE POLICY "Admins can manage catalog items" ON public.items
  FOR ALL
  USING (server_id IS NULL AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (server_id IS NULL AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- ── Seed default rarities for existing games ──
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
