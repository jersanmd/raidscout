-- 113: Keep dkp_cost after auction resolve (needed for auction history)
-- Fix resolve_auction to preserve dkp_cost
CREATE OR REPLACE FUNCTION public.resolve_auction(p_item_id UUID, p_winner_bid_id UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_bid RECORD;
  v_server_id UUID;
BEGIN
  SELECT server_id INTO v_server_id FROM public.items WHERE id = p_item_id FOR UPDATE;

  IF p_winner_bid_id IS NULL THEN
    FOR v_bid IN SELECT * FROM public.dkp_bids WHERE item_id = p_item_id AND status = 'active'
    LOOP
      INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
      VALUES (v_server_id, v_bid.member_id, v_bid.bid_amount, 'earn_refund', 'Auction cancelled', v_bid.id, 'bid');
      UPDATE public.dkp_bids SET status = 'cancelled', resolved_at = now() WHERE id = v_bid.id;
    END LOOP;
  ELSE
    UPDATE public.dkp_bids SET status = 'won', resolved_at = now() WHERE id = p_winner_bid_id;
    FOR v_bid IN SELECT * FROM public.dkp_bids WHERE item_id = p_item_id AND status = 'active' AND id != p_winner_bid_id
    LOOP
      INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
      VALUES (v_server_id, v_bid.member_id, v_bid.bid_amount, 'earn_refund', 'Bid lost', v_bid.id, 'bid');
      UPDATE public.dkp_bids SET status = 'lost', resolved_at = now() WHERE id = v_bid.id;
    END LOOP;
  END IF;

  -- Clear bid flags (keep dkp_cost for auction history)
  UPDATE public.items SET is_up_for_bid = false, bid_end_time = NULL WHERE id = p_item_id;
END;
$$;
