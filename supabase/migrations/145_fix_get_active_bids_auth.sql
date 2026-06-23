-- 145: Add server membership auth check to get_active_bids (parity with get_item_bids/get_resolved_bids)
DROP FUNCTION IF EXISTS public.get_active_bids(uuid);
CREATE OR REPLACE FUNCTION public.get_active_bids(p_server_id UUID)
RETURNS TABLE(
  id UUID,
  item_id UUID,
  item_name TEXT,
  auction_id UUID,
  member_id UUID,
  member_name TEXT,
  bid_amount INTEGER,
  status TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Require server membership
  IF NOT EXISTS (
    SELECT 1 FROM public.server_members sm
    WHERE sm.server_id = p_server_id AND sm.user_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT 
    b.id, b.item_id, i.name AS item_name, b.auction_id,
    b.member_id, m.name AS member_name,
    b.bid_amount, b.status, b.created_at
  FROM public.dkp_bids b
  JOIN public.items i ON i.id = b.item_id
  JOIN public.members m ON m.id = b.member_id
  WHERE b.server_id = p_server_id AND b.status IN ('active', 'lost')
  ORDER BY b.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_bids(UUID) TO authenticated;
