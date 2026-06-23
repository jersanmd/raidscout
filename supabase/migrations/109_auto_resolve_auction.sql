-- 109: Auto-resolve expired auctions (picks highest bidder)
CREATE OR REPLACE FUNCTION public.auto_resolve_auction(p_item_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_winner_bid_id UUID;
  v_bid RECORD;
  v_server_id UUID;
BEGIN
  SELECT server_id INTO v_server_id FROM public.items WHERE id = p_item_id FOR UPDATE;

  -- Find highest bid
  SELECT id INTO v_winner_bid_id
  FROM public.dkp_bids
  WHERE item_id = p_item_id AND status = 'active'
  ORDER BY bid_amount DESC, created_at ASC
  LIMIT 1;

  IF v_winner_bid_id IS NOT NULL THEN
    -- Award winner
    UPDATE public.dkp_bids SET status = 'won', resolved_at = now() WHERE id = v_winner_bid_id;

    -- Refund losers
    FOR v_bid IN SELECT * FROM public.dkp_bids WHERE item_id = p_item_id AND status = 'active' AND id != v_winner_bid_id
    LOOP
      INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
      VALUES (v_server_id, v_bid.member_id, v_bid.bid_amount, 'earn_refund', 'Bid lost', v_bid.id, 'bid');
      UPDATE public.dkp_bids SET status = 'lost', resolved_at = now() WHERE id = v_bid.id;
    END LOOP;
  ELSE
    -- No bids: just close the auction (cancel)
    FOR v_bid IN SELECT * FROM public.dkp_bids WHERE item_id = p_item_id AND status = 'active'
    LOOP
      INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
      VALUES (v_server_id, v_bid.member_id, v_bid.bid_amount, 'earn_refund', 'Auction expired with no winner', v_bid.id, 'bid');
      UPDATE public.dkp_bids SET status = 'cancelled', resolved_at = now() WHERE id = v_bid.id;
    END LOOP;
  END IF;

  -- Clear item bid flags
  UPDATE public.items SET is_up_for_bid = false, dkp_cost = NULL, bid_end_time = NULL WHERE id = p_item_id;
END;
$$;
