-- 111: place_bid - refund outbid losers immediately + extend timer on late bids
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
BEGIN
  -- Resolve member from auth user
  SELECT m.id, m.server_id INTO v_member_id, v_server_id
  FROM public.members m WHERE m.user_id = v_user_id
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'You must claim your profile first'; END IF;

  -- Validate item
  SELECT id, is_up_for_bid, dkp_min_bid, bid_end_time, server_id 
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
  END IF;

  -- Deduct DKP
  INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
  VALUES (v_server_id, v_member_id, -p_amount, 'spend_bid', 'Bid placed', NULL, 'bid');

  -- Create bid
  INSERT INTO public.dkp_bids (server_id, item_id, member_id, bid_amount, status)
  VALUES (v_server_id, p_item_id, v_member_id, p_amount, 'active')
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
