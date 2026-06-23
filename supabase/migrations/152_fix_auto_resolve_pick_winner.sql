-- 152: Fix auto_resolve_auction — pick the highest bidder as winner instead of cancelling
DROP FUNCTION IF EXISTS public.auto_resolve_auction(uuid);
CREATE OR REPLACE FUNCTION public.auto_resolve_auction(p_item_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auction RECORD;
  v_winner_bid_id UUID;
BEGIN
  FOR v_auction IN SELECT id FROM public.dkp_auctions
    WHERE item_id = p_item_id AND status = 'active' AND bid_end_time <= now()
  LOOP
    -- Find the highest active bid for this auction
    SELECT id INTO v_winner_bid_id
    FROM public.dkp_bids
    WHERE auction_id = v_auction.id AND status = 'active'
    ORDER BY bid_amount DESC, created_at ASC
    LIMIT 1;

    -- Resolve with winner if there's a bid, otherwise cancel
    PERFORM public.resolve_auction(v_auction.id, v_winner_bid_id);
  END LOOP;
END;
$$;
