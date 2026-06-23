-- 118: Add DKP bid notifications (outbid, won, lost) to place_bid and auto_resolve_auction

-- Update place_bid to notify the outbid user
DROP FUNCTION IF EXISTS public.place_bid(uuid, integer);
CREATE OR REPLACE FUNCTION public.place_bid(p_item_id UUID, p_amount INTEGER)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_member_id UUID;
  v_server_id UUID;
  v_item RECORD;
  v_existing_bid RECORD;
  v_prev_highest RECORD;
  v_balance INTEGER;
  v_bid_id UUID;
  v_remaining_secs INTEGER;
  v_outbid_user_id UUID;
BEGIN
  -- Resolve member from auth user
  SELECT m.id, m.server_id INTO v_member_id, v_server_id
  FROM public.members m WHERE m.user_id = v_user_id
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'You must claim your profile first'; END IF;

  -- Validate item
  SELECT id, name, is_up_for_bid, dkp_min_bid, bid_end_time, server_id, auction_round
  INTO v_item FROM public.items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not found'; END IF;
  IF NOT v_item.is_up_for_bid THEN RAISE EXCEPTION 'Item is not up for bid'; END IF;
  IF v_item.bid_end_time < now() THEN RAISE EXCEPTION 'Bidding has ended'; END IF;
  IF p_amount < COALESCE(v_item.dkp_min_bid, 1) THEN RAISE EXCEPTION 'Bid below minimum'; END IF;

  -- Check balance (excluding this item's existing bid)
  SELECT COALESCE(balance, 0) INTO v_balance 
  FROM public.dkp_balances WHERE member_id = v_member_id AND server_id = v_server_id;

  -- Add back any existing bid on this item
  SELECT id, bid_amount INTO v_existing_bid FROM public.dkp_bids
  WHERE item_id = p_item_id AND member_id = v_member_id AND status = 'active'
  LIMIT 1;

  IF v_existing_bid.id IS NOT NULL THEN
    v_balance := v_balance + v_existing_bid.bid_amount;
  END IF;

  IF v_balance < p_amount THEN 
    RAISE EXCEPTION 'Insufficient DKP. You have % DKP available.', v_balance; 
  END IF;

  -- Find previous highest bidder (if different from current bidder)
  SELECT id, member_id, bid_amount INTO v_prev_highest
  FROM public.dkp_bids
  WHERE item_id = p_item_id AND status = 'active' AND member_id != v_member_id
  ORDER BY bid_amount DESC, created_at ASC
  LIMIT 1;

  -- Refund existing bid if any (user is re-bidding)
  IF v_existing_bid.id IS NOT NULL THEN
    INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
    VALUES (v_server_id, v_member_id, v_existing_bid.bid_amount, 'earn_refund', 'Bid changed', v_existing_bid.id, 'bid');
    UPDATE public.dkp_bids SET status = 'cancelled', resolved_at = now() WHERE id = v_existing_bid.id;
  END IF;

  -- Refund previous highest bidder immediately (they were outbid)
  IF v_prev_highest.id IS NOT NULL THEN
    INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
    VALUES (v_server_id, v_prev_highest.member_id, v_prev_highest.bid_amount, 'earn_refund', 'Outbid', v_prev_highest.id, 'bid');
    UPDATE public.dkp_bids SET status = 'lost', resolved_at = now() WHERE id = v_prev_highest.id;

    -- Notify outbid user
    SELECT m.user_id INTO v_outbid_user_id FROM public.members m WHERE m.id = v_prev_highest.member_id;
    IF v_outbid_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, server_id, type, title, body, metadata)
      VALUES (v_outbid_user_id, v_server_id, 'dkp_outbid',
        'You were outbid!',
        'Your bid of ' || v_prev_highest.bid_amount || ' DKP on "' || COALESCE(v_item.name, 'Unknown item') || '" was outbid. Your DKP has been refunded.',
        jsonb_build_object('item_id', p_item_id, 'outbid_amount', v_prev_highest.bid_amount, 'new_bid_amount', p_amount));
    END IF;
  END IF;

  -- Deduct DKP
  INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
  VALUES (v_server_id, v_member_id, -p_amount, 'spend_bid', 'Bid placed', NULL, 'bid');

  -- Create bid with auction_round from the item
  INSERT INTO public.dkp_bids (server_id, item_id, member_id, bid_amount, status, auction_round)
  VALUES (v_server_id, p_item_id, v_member_id, p_amount, 'active', v_item.auction_round)
  RETURNING id INTO v_bid_id;

  -- Update transaction with bid reference
  UPDATE public.dkp_transactions SET reference_id = v_bid_id 
  WHERE reference_type = 'bid' AND member_id = v_member_id AND amount = -p_amount
  AND created_at > now() - INTERVAL '1 second'
  AND reference_id IS NULL;

  -- Extend bid time if less than 3 minutes remaining (soft close)
  v_remaining_secs := EXTRACT(EPOCH FROM (v_item.bid_end_time - now()));
  IF v_remaining_secs < 180 THEN
    UPDATE public.items SET bid_end_time = now() + INTERVAL '3 minutes' WHERE id = p_item_id;
  END IF;

  RETURN v_bid_id;
END;
$$;

-- Update auto_resolve_auction to notify winners and losers
DROP FUNCTION IF EXISTS public.auto_resolve_auction(uuid);
CREATE OR REPLACE FUNCTION public.auto_resolve_auction(p_item_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_winner_bid_id UUID;
  v_winner_member_id UUID;
  v_winner_user_id UUID;
  v_winner_amount INTEGER;
  v_item_name TEXT;
  v_server_id UUID;
  v_bid RECORD;
BEGIN
  -- Get item info
  SELECT name, server_id INTO v_item_name, v_server_id FROM public.items WHERE id = p_item_id;

  -- Find highest active bid
  SELECT id, member_id, bid_amount INTO v_winner_bid_id, v_winner_member_id, v_winner_amount
  FROM public.dkp_bids
  WHERE item_id = p_item_id AND status = 'active'
  ORDER BY bid_amount DESC, created_at ASC
  LIMIT 1;

  IF v_winner_bid_id IS NOT NULL THEN
    -- Award winner
    UPDATE public.dkp_bids SET status = 'won', resolved_at = now() WHERE id = v_winner_bid_id;

    -- Notify winner
    SELECT m.user_id INTO v_winner_user_id FROM public.members m WHERE m.id = v_winner_member_id;
    IF v_winner_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, server_id, type, title, body, metadata)
      VALUES (v_winner_user_id, v_server_id, 'dkp_won',
        'You won the auction!',
        'You won "' || COALESCE(v_item_name, 'Unknown item') || '" for ' || v_winner_amount || ' DKP.',
        jsonb_build_object('item_id', p_item_id, 'item_name', v_item_name, 'winning_bid', v_winner_amount));
    END IF;
  END IF;

  -- Notify remaining active bidders they lost
  FOR v_bid IN
    SELECT b.id, b.member_id, b.bid_amount, m.user_id
    FROM public.dkp_bids b
    JOIN public.members m ON m.id = b.member_id
    WHERE b.item_id = p_item_id AND b.status = 'active' AND b.id != v_winner_bid_id
  LOOP
    IF v_bid.user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, server_id, type, title, body, metadata)
      VALUES (v_bid.user_id, v_server_id, 'dkp_lost',
        'Auction ended — you did not win',
        'You did not win "' || COALESCE(v_item_name, 'Unknown item') || '". Your DKP has been refunded.',
        jsonb_build_object('item_id', p_item_id, 'item_name', v_item_name));
    END IF;
  END LOOP;

  -- Mark remaining active bids as cancelled (refunds were already processed on outbid)
  UPDATE public.dkp_bids SET status = 'cancelled', resolved_at = now()
  WHERE item_id = p_item_id AND status = 'active';

  -- Clear item bid flags
  UPDATE public.items SET is_up_for_bid = false, bid_end_time = NULL WHERE id = p_item_id;
END;
$$;
