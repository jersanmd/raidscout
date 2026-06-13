-- 024_member_gear_fk_fix: Change catalog_item_id FK from gear_catalog to items
-- The gear editor uses game-level items (items table), not gear_catalog

-- Drop old FKs
ALTER TABLE public.member_gear DROP CONSTRAINT IF EXISTS member_gear_catalog_item_id_fkey;
ALTER TABLE public.gear_upgrade_history DROP CONSTRAINT IF EXISTS gear_upgrade_history_old_item_id_fkey;
ALTER TABLE public.gear_upgrade_history DROP CONSTRAINT IF EXISTS gear_upgrade_history_new_item_id_fkey;

-- Add new FKs to items table
ALTER TABLE public.member_gear 
  ADD CONSTRAINT member_gear_catalog_item_id_fkey 
  FOREIGN KEY (catalog_item_id) REFERENCES public.items(id) ON DELETE SET NULL;

ALTER TABLE public.gear_upgrade_history 
  ADD CONSTRAINT gear_upgrade_history_old_item_id_fkey 
  FOREIGN KEY (old_item_id) REFERENCES public.items(id) ON DELETE SET NULL;

ALTER TABLE public.gear_upgrade_history 
  ADD CONSTRAINT gear_upgrade_history_new_item_id_fkey 
  FOREIGN KEY (new_item_id) REFERENCES public.items(id) ON DELETE SET NULL;

-- Update get_gear_summary RPC to join against items instead of gear_catalog
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
        CASE WHEN i.rarity = 'legendary' THEN 10
             WHEN i.rarity = 'epic' THEN 5
             WHEN i.rarity = 'rare' THEN 3
             WHEN i.rarity = 'uncommon' THEN 2
             ELSE 1
        END + mg.enhancement_level
      ), 0)::int AS gear_score
    FROM public.member_gear mg
    JOIN public.members m ON m.id = mg.member_id
    LEFT JOIN public.items i ON i.id = mg.catalog_item_id
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
