-- 143: Fix resolve_auction — validate winner bid belongs to the auction being resolved
-- Previously p_winner_bid_id had no auction_id check, allowing cross-auction manipulation.
DROP FUNCTION IF EXISTS public.resolve_auction(uuid, uuid);
CREATE OR REPLACE FUNCTION public.resolve_auction(p_auction_id UUID, p_winner_bid_id UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_bid RECORD;
  v_server_id UUID;
  v_item_name TEXT;
  v_item_id UUID;
  v_winner_user_id UUID;
  v_winner_amount INTEGER;
  v_active_count INTEGER;
BEGIN
  SELECT a.server_id, a.item_id, i.name INTO v_server_id, v_item_id, v_item_name
  FROM public.dkp_auctions a JOIN public.items i ON i.id = a.item_id
  WHERE a.id = p_auction_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Auction not found'; END IF;

  IF p_winner_bid_id IS NULL THEN
    FOR v_bid IN SELECT b.*, m.user_id FROM public.dkp_bids b JOIN public.members m ON m.id = b.member_id WHERE b.auction_id = p_auction_id AND b.status = 'active'
    LOOP
      INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
      VALUES (v_server_id, v_bid.member_id, v_bid.bid_amount, 'earn_refund', 'Auction cancelled', v_bid.id, 'bid');
      UPDATE public.dkp_bids SET status = 'cancelled', resolved_at = now() WHERE id = v_bid.id;

      IF v_bid.user_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, server_id, type, title, body, metadata)
        VALUES (v_bid.user_id, v_server_id, 'dkp_lost',
          'Auction cancelled',
          'The auction for "' || COALESCE(v_item_name, 'Unknown item') || '" was cancelled. Your DKP has been refunded.',
          jsonb_build_object('auction_id', p_auction_id, 'item_name', v_item_name));
      END IF;
    END LOOP;
  ELSE
    -- Validate winner bid belongs to this auction
    SELECT bid_amount INTO v_winner_amount FROM public.dkp_bids
    WHERE id = p_winner_bid_id AND auction_id = p_auction_id AND status = 'active';

    IF NOT FOUND THEN RAISE EXCEPTION 'Winner bid not found or does not belong to this auction'; END IF;

    UPDATE public.dkp_bids SET status = 'won', resolved_at = now()
    WHERE id = p_winner_bid_id AND auction_id = p_auction_id;

    SELECT m.user_id INTO v_winner_user_id FROM public.members m
    WHERE m.id = (SELECT member_id FROM public.dkp_bids WHERE id = p_winner_bid_id AND auction_id = p_auction_id);

    IF v_winner_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, server_id, type, title, body, metadata)
      VALUES (v_winner_user_id, v_server_id, 'dkp_won',
        'You won the auction!',
        'You won "' || COALESCE(v_item_name, 'Unknown item') || '" for ' || COALESCE(v_winner_amount, 0) || ' DKP.',
        jsonb_build_object('auction_id', p_auction_id, 'item_name', v_item_name, 'winning_bid', v_winner_amount));
    END IF;

    FOR v_bid IN SELECT b.*, m.user_id FROM public.dkp_bids b JOIN public.members m ON m.id = b.member_id WHERE b.auction_id = p_auction_id AND b.status = 'active' AND b.id != p_winner_bid_id
    LOOP
      INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
      VALUES (v_server_id, v_bid.member_id, v_bid.bid_amount, 'earn_refund', 'Bid lost', v_bid.id, 'bid');
      UPDATE public.dkp_bids SET status = 'lost', resolved_at = now() WHERE id = v_bid.id;

      IF v_bid.user_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, server_id, type, title, body, metadata)
        VALUES (v_bid.user_id, v_server_id, 'dkp_lost',
          'Auction ended — you did not win',
          'You did not win "' || COALESCE(v_item_name, 'Unknown item') || '". Your DKP has been refunded.',
          jsonb_build_object('auction_id', p_auction_id, 'item_name', v_item_name));
      END IF;
    END LOOP;
  END IF;

  UPDATE public.dkp_auctions SET status = 'resolved' WHERE id = p_auction_id;

  -- If no more active auctions for this item, clear is_up_for_bid
  SELECT COUNT(*) INTO v_active_count FROM public.dkp_auctions WHERE item_id = v_item_id AND status = 'active';
  IF v_active_count = 0 THEN
    UPDATE public.items SET is_up_for_bid = false, bid_end_time = NULL WHERE id = v_item_id;
  END IF;
END;
$$;
