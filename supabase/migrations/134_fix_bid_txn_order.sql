-- 134: Fix bid transaction order — insert bid first, then transaction with reference_id set immediately
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
  SELECT m.id, m.server_id INTO v_member_id, v_server_id
  FROM public.members m WHERE m.user_id = v_user_id
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'You must claim your profile first'; END IF;

  SELECT id, name, is_up_for_bid, dkp_min_bid, bid_end_time, server_id, auction_round, dkp_guild_id
  INTO v_item FROM public.items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not found'; END IF;
  IF NOT v_item.is_up_for_bid THEN RAISE EXCEPTION 'Item is not up for bid'; END IF;
  IF v_item.bid_end_time < now() THEN RAISE EXCEPTION 'Bidding has ended'; END IF;
  IF p_amount < COALESCE(v_item.dkp_min_bid, 1) THEN RAISE EXCEPTION 'Bid below minimum'; END IF;

  -- Guild restriction check
  IF v_item.dkp_guild_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.members m WHERE m.id = v_member_id AND m.guild_id = v_item.dkp_guild_id) THEN
      RAISE EXCEPTION 'This auction is restricted to guild members only';
    END IF;
  END IF;

  SELECT COALESCE(balance, 0) INTO v_balance 
  FROM public.dkp_balances WHERE member_id = v_member_id AND server_id = v_server_id;

  SELECT id, bid_amount INTO v_existing_bid FROM public.dkp_bids
  WHERE item_id = p_item_id AND member_id = v_member_id AND status = 'active'
  LIMIT 1;

  IF v_existing_bid.id IS NOT NULL THEN
    v_balance := v_balance + v_existing_bid.bid_amount;
  END IF;

  IF v_balance < p_amount THEN 
    RAISE EXCEPTION 'Insufficient DKP. You have % DKP available.', v_balance; 
  END IF;

  SELECT id, member_id, bid_amount INTO v_prev_highest
  FROM public.dkp_bids
  WHERE item_id = p_item_id AND status = 'active' AND member_id != v_member_id
  ORDER BY bid_amount DESC, created_at ASC
  LIMIT 1;

  -- Refund existing bid (re-bidding)
  IF v_existing_bid.id IS NOT NULL THEN
    INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
    VALUES (v_server_id, v_member_id, v_existing_bid.bid_amount, 'earn_refund', 'Bid changed', v_existing_bid.id, 'bid');
    UPDATE public.dkp_bids SET status = 'cancelled', resolved_at = now() WHERE id = v_existing_bid.id;
  END IF;

  -- Refund outbid loser immediately
  IF v_prev_highest.id IS NOT NULL THEN
    INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
    VALUES (v_server_id, v_prev_highest.member_id, v_prev_highest.bid_amount, 'earn_refund', 'Outbid', v_prev_highest.id, 'bid');
    UPDATE public.dkp_bids SET status = 'lost', resolved_at = now() WHERE id = v_prev_highest.id;

    SELECT m.user_id INTO v_outbid_user_id FROM public.members m WHERE m.id = v_prev_highest.member_id;
    IF v_outbid_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, server_id, type, title, body, metadata)
      VALUES (v_outbid_user_id, v_server_id, 'dkp_outbid',
        'You were outbid!',
        'Your bid of ' || v_prev_highest.bid_amount || ' DKP on "' || COALESCE(v_item.name, 'Unknown item') || '" was outbid. Your DKP has been refunded.',
        jsonb_build_object('item_id', p_item_id, 'outbid_amount', v_prev_highest.bid_amount, 'new_bid_amount', p_amount));
    END IF;
  END IF;

  -- Insert bid FIRST so we have the ID
  INSERT INTO public.dkp_bids (server_id, item_id, member_id, bid_amount, status, auction_round)
  VALUES (v_server_id, p_item_id, v_member_id, p_amount, 'active', v_item.auction_round)
  RETURNING id INTO v_bid_id;

  -- Insert spend transaction with reference_id set immediately
  INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
  VALUES (v_server_id, v_member_id, -p_amount, 'spend_bid', 'Bid ' || p_amount || ' DKP', v_bid_id, 'bid');

  -- Extend timer if less than 3 minutes remaining
  v_remaining_secs := EXTRACT(EPOCH FROM (v_item.bid_end_time - now()));
  IF v_remaining_secs < 180 THEN
    UPDATE public.items SET bid_end_time = now() + INTERVAL '3 minutes' WHERE id = p_item_id;
  END IF;

  RETURN v_bid_id;
END;
$$;
