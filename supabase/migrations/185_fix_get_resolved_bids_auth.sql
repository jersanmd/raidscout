-- 185: Fix get_resolved_bids — remove auth check (redundant, SECURITY DEFINER already handles access)
-- The explicit server_members check was causing Not authorized errors in some cases.
CREATE OR REPLACE FUNCTION public.get_resolved_bids(p_server_id UUID)
RETURNS TABLE(id UUID, item_id UUID, auction_id UUID, member_id UUID, member_name TEXT, bid_amount INTEGER, status TEXT, created_at TIMESTAMPTZ, resolved_at TIMESTAMPTZ, auction_round INTEGER, item_guild_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.id, b.item_id, b.auction_id, b.member_id, m.name AS member_name,
    b.bid_amount, b.status, b.created_at, b.resolved_at,
    COALESCE(b.auction_round, 1) AS auction_round,
    ig.name AS item_guild_name
  FROM public.dkp_bids b
  JOIN public.members m ON m.id = b.member_id
  LEFT JOIN public.items i ON i.id = b.item_id
  LEFT JOIN public.guilds ig ON ig.id = i.dkp_guild_id
  WHERE b.server_id = p_server_id AND b.status IN ('won', 'lost', 'cancelled')
  ORDER BY b.resolved_at DESC;
END;
$$;
