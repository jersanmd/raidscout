-- 133: COALESCE bidder_name to prevent null rendering
DROP FUNCTION IF EXISTS public.get_member_dkp_history(uuid, uuid, integer, timestamptz);
CREATE OR REPLACE FUNCTION public.get_member_dkp_history(
  p_member_id UUID,
  p_server_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_cursor TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  amount INTEGER,
  type TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ,
  boss_name TEXT,
  death_time TIMESTAMPTZ,
  guild_name TEXT,
  item_name TEXT,
  item_rarity TEXT,
  item_guild_name TEXT,
  bidder_name TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 
    dt.id, dt.amount, dt.type, dt.reason, dt.created_at,
    b.name AS boss_name,
    dr.death_time,
    g.name AS guild_name,
    i.name AS item_name,
    i.rarity AS item_rarity,
    ig.name AS item_guild_name,
    bm.name AS bidder_name
  FROM public.dkp_transactions dt
  LEFT JOIN public.death_records dr ON dr.id = dt.reference_id AND dt.reference_type = 'death_record'
  LEFT JOIN public.bosses b ON b.id = dr.boss_id
  LEFT JOIN public.guilds g ON g.id = COALESCE(dr.display_owner_guild_id, dr.owner_guild_id)
  LEFT JOIN public.dkp_bids db ON db.id = dt.reference_id AND dt.reference_type = 'bid'
  LEFT JOIN public.items i ON i.id = db.item_id
  LEFT JOIN public.guilds ig ON ig.id = i.dkp_guild_id
  LEFT JOIN public.members bm ON bm.id = db.member_id
  WHERE dt.member_id = p_member_id AND dt.server_id = p_server_id
    AND (p_cursor IS NULL OR dt.created_at < p_cursor)
  ORDER BY dt.created_at DESC
  LIMIT p_limit;
$$;
