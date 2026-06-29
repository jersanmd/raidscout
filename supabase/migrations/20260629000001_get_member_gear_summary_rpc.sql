-- SECURITY DEFINER RPC: Cross-server member gear summary (bypasses member_gear RLS)
-- Used by MembersSummaryView Gear Tracking tab to fetch gear across all staff servers

DROP FUNCTION IF EXISTS public.get_member_gear_summary(UUID[]);

CREATE OR REPLACE FUNCTION public.get_member_gear_summary(p_member_ids UUID[])
RETURNS TABLE(
  member_id UUID,
  slot_id TEXT,
  catalog_item_id UUID,
  enhancement_level INT,
  item_name TEXT,
  item_rarity TEXT,
  item_image_url TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 
    mg.member_id,
    mg.slot_id,
    mg.catalog_item_id,
    mg.enhancement_level,
    i.name AS item_name,
    i.rarity AS item_rarity,
    i.image_url AS item_image_url
  FROM public.member_gear mg
  LEFT JOIN public.items i ON i.id = mg.catalog_item_id
  WHERE mg.member_id = ANY(p_member_ids);
$$;

GRANT EXECUTE ON FUNCTION public.get_member_gear_summary(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_member_gear_summary(UUID[]) TO anon;
