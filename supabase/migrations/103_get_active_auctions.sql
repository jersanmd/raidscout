-- 103: get_active_auctions — items marked for bid with bid stats
CREATE OR REPLACE FUNCTION public.get_active_auctions(p_server_id UUID)
RETURNS TABLE(
  item_id UUID,
  item_name TEXT,
  image_url TEXT,
  rarity TEXT,
  dkp_cost INTEGER,
  bid_end_time TIMESTAMPTZ,
  highest_bid INTEGER,
  bid_count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    i.id AS item_id,
    i.name AS item_name,
    i.image_url,
    i.rarity,
    i.dkp_cost,
    i.bid_end_time,
    COALESCE(MAX(b.bid_amount), 0) AS highest_bid,
    COUNT(b.id) AS bid_count
  FROM public.items i
  LEFT JOIN public.dkp_bids b ON b.item_id = i.id AND b.status = 'active'
  WHERE i.server_id = p_server_id
    AND i.is_up_for_bid = true
    AND i.bid_end_time > now()
  GROUP BY i.id, i.name, i.image_url, i.rarity, i.dkp_cost, i.bid_end_time
  ORDER BY i.bid_end_time ASC;
$$;
