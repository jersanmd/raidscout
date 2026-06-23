-- 109: Auto-resolve expired auctions (picks highest bidder)
-- Note: Losers are already refunded when outbid in place_bid (111).
-- This only marks the winner and clears item flags.
CREATE OR REPLACE FUNCTION public.auto_resolve_auction(p_item_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_winner_bid_id UUID;
  v_bid RECORD;
BEGIN
  -- Find highest active bid
  SELECT id INTO v_winner_bid_id
  FROM public.dkp_bids
  WHERE item_id = p_item_id AND status = 'active'
  ORDER BY bid_amount DESC, created_at ASC
  LIMIT 1;

  IF v_winner_bid_id IS NOT NULL THEN
    -- Award winner
    UPDATE public.dkp_bids SET status = 'won', resolved_at = now() WHERE id = v_winner_bid_id;
  END IF;

  -- Mark any remaining active bids as lost/cancelled (they were already refunded on outbid)
  UPDATE public.dkp_bids SET status = 'cancelled', resolved_at = now()
  WHERE item_id = p_item_id AND status = 'active';

  -- Clear item bid flags (keep dkp_cost for auction history)
  UPDATE public.items SET is_up_for_bid = false, bid_end_time = NULL WHERE id = p_item_id;
END;
$$;
