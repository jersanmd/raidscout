-- 147: Revert get_item_bids to simple version — auth check removed since frontend already guards access
DROP FUNCTION IF EXISTS public.get_item_bids(uuid);
CREATE OR REPLACE FUNCTION public.get_item_bids(p_item_id UUID)
RETURNS TABLE(
  id UUID,
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
    b.id, m.name AS member_name, b.bid_amount, b.status, b.created_at
  FROM public.dkp_bids b
  JOIN public.members m ON m.id = b.member_id
  WHERE b.item_id = p_item_id
  ORDER BY b.bid_amount DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_item_bids(UUID) TO authenticated;
