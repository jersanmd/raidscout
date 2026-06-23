-- 160: Improve dkp_outbid notification body to show new bid amount
CREATE OR REPLACE FUNCTION public.place_bid(p_auction_id UUID, p_amount INTEGER)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_member_id UUID;
  v_server_id UUID;
  v_auction RECORD;
  v_existing_bid RECORD;
  v_prev_highest RECORD;
  v_balance INTEGER;
  v_bid_id UUID;
  v_remaining_secs INTEGER;
  v_outbid_user_id UUID;
BEGIN
  SELECT a.id, a.item_id, a.dkp_cost, a.bid_end_time, a.server_id, a.guild_id, a.status,
         i.name AS item_name
  INTO v_auction
  FROM public.dkp_auctions a
  JOIN public.items i ON i.id = a.item_id
  WHERE a.id = p_auction_id FOR UPDATE;
  
  IF NOT FOUND THEN RAISE EXCEPTION 'Auction not found'; END IF;
  IF v_auction.status != 'active' THEN RAISE EXCEPTION 'Auction is not active'; END IF;
  IF v_auction.bid_end_time < now() THEN RAISE EXCEPTION 'Bidding has ended'; END IF;
  IF p_amount < COALESCE(v_auction.dkp_cost, 1) THEN RAISE EXCEPTION 'Bid below minimum'; END IF;

  SELECT m.id INTO v_member_id FROM public.members m 
  WHERE m.user_id = v_user_id AND m.server_id = v_auction.server_id
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'You must claim your profile first'; END IF;
  v_server_id := v_auction.server_id;

  IF v_auction.guild_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.members m WHERE m.id = v_member_id AND m.guild_id = v_auction.guild_id) THEN
      RAISE EXCEPTION 'This auction is restricted to guild members only';
    END IF;
  END IF;

  SELECT COALESCE(balance, 0) INTO v_balance 
  FROM public.dkp_balances WHERE member_id = v_member_id AND server_id = v_server_id;

  SELECT id, bid_amount INTO v_existing_bid FROM public.dkp_bids
  WHERE auction_id = p_auction_id AND member_id = v_member_id AND status = 'active'
  LIMIT 1;

  IF v_existing_bid.id IS NOT NULL THEN
    v_balance := v_balance + v_existing_bid.bid_amount;
  END IF;

  IF v_balance < p_amount THEN 
    RAISE EXCEPTION 'Insufficient DKP. You have % DKP available.', v_balance; 
  END IF;

  SELECT id, member_id, bid_amount INTO v_prev_highest
  FROM public.dkp_bids
  WHERE auction_id = p_auction_id AND status = 'active' AND member_id != v_member_id
  ORDER BY bid_amount DESC, created_at ASC
  LIMIT 1;

  IF v_existing_bid.id IS NOT NULL THEN
    INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
    VALUES (v_server_id, v_member_id, v_existing_bid.bid_amount, 'earn_refund', 'Bid changed', v_existing_bid.id, 'bid');
    UPDATE public.dkp_bids SET status = 'cancelled', resolved_at = now() WHERE id = v_existing_bid.id;
  END IF;

  IF v_prev_highest.id IS NOT NULL THEN
    INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
    VALUES (v_server_id, v_prev_highest.member_id, v_prev_highest.bid_amount, 'earn_refund', 'Outbid', v_prev_highest.id, 'bid');
    UPDATE public.dkp_bids SET status = 'lost', resolved_at = now() WHERE id = v_prev_highest.id;

    SELECT m.user_id INTO v_outbid_user_id FROM public.members m WHERE m.id = v_prev_highest.member_id;
    IF v_outbid_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, server_id, type, title, body, metadata)
      VALUES (v_outbid_user_id, v_server_id, 'dkp_outbid',
        'You were outbid!',
        'Your bid of ' || v_prev_highest.bid_amount || ' DKP on "' || COALESCE(v_auction.item_name, 'Unknown item') || '" was outbid by ' || p_amount || ' DKP. Your ' || v_prev_highest.bid_amount || ' DKP has been refunded — you can bid again.',
        jsonb_build_object('auction_id', p_auction_id, 'outbid_amount', v_prev_highest.bid_amount, 'new_bid_amount', p_amount));
    END IF;
  END IF;

  INSERT INTO public.dkp_bids (server_id, item_id, auction_id, member_id, bid_amount, status, auction_round)
  VALUES (v_server_id, v_auction.item_id, p_auction_id, v_member_id, p_amount, 'active', 1)
  RETURNING id INTO v_bid_id;

  INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
  VALUES (v_server_id, v_member_id, -p_amount, 'spend_bid', 'Bid ' || p_amount || ' DKP', v_bid_id, 'bid');

  v_remaining_secs := EXTRACT(EPOCH FROM (v_auction.bid_end_time - now()));
  IF v_remaining_secs < 180 THEN
    UPDATE public.dkp_auctions SET bid_end_time = now() + INTERVAL '3 minutes' WHERE id = p_auction_id;
  END IF;

  RETURN v_bid_id;
END;
$$;
