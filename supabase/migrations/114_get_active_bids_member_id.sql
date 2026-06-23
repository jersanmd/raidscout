-- 114: Add member_id to get_active_bids for winning bidder detection + include lost bids for count
DROP FUNCTION IF EXISTS public.get_active_bids(uuid);
CREATE OR REPLACE FUNCTION public.get_active_bids(p_server_id UUID)
RETURNS TABLE(
  id UUID,
  item_id UUID,
  item_name TEXT,
  member_id UUID,
  member_name TEXT,
  bid_amount INTEGER,
  status TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 
    b.id, b.item_id, i.name AS item_name, b.member_id, m.name AS member_name,
    b.bid_amount, b.status, b.created_at
  FROM public.dkp_bids b
  JOIN public.items i ON i.id = b.item_id
  JOIN public.members m ON m.id = b.member_id
  WHERE b.server_id = p_server_id AND b.status IN ('active', 'lost')
  ORDER BY b.created_at DESC;
$$;
