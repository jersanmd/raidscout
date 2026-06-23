-- 124: Reset dkp_distributed when marking item for bid
CREATE OR REPLACE FUNCTION public.mark_item_for_bid(
  p_item_id UUID,
  p_dkp_cost INTEGER,
  p_bid_end_time TIMESTAMPTZ DEFAULT NULL,
  p_duration_minutes INTEGER DEFAULT 30
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.items 
  SET is_up_for_bid = true, 
      dkp_cost = p_dkp_cost, 
      bid_end_time = COALESCE(p_bid_end_time, now() + (p_duration_minutes || ' minutes')::INTERVAL),
      auction_round = auction_round + 1,
      dkp_distributed = false
  WHERE id = p_item_id;
END;
$$;
