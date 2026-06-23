-- 137: Fix critical audit issues C1-C5
-- C1: markClaimRead — Fix RLS so users can mark their own claims as read
DROP POLICY IF EXISTS "Users can read own claims" ON public.member_claim_requests;
CREATE POLICY "Users can manage own claims" ON public.member_claim_requests
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- C2: place_bid — Filter member lookup by the item's server to prevent cross-server member selection
-- C4: auto_resolve_auction — Refund losers properly
-- C3: resolve_auction — Add notifications for winner/loser/cancelled
-- All combined into updated RPCs below

-- ── Updated place_bid: fix multi-server member selection ──
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
  -- Lock item and get its server first
  SELECT id, name, is_up_for_bid, dkp_min_bid, bid_end_time, server_id, auction_round, dkp_guild_id
  INTO v_item FROM public.items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not found'; END IF;
  IF NOT v_item.is_up_for_bid THEN RAISE EXCEPTION 'Item is not up for bid'; END IF;
  IF v_item.bid_end_time < now() THEN RAISE EXCEPTION 'Bidding has ended'; END IF;
  IF p_amount < COALESCE(v_item.dkp_min_bid, 1) THEN RAISE EXCEPTION 'Bid below minimum'; END IF;

  -- C2 FIX: Filter member by the item's server_id to avoid picking wrong member
  SELECT m.id INTO v_member_id FROM public.members m 
  WHERE m.user_id = v_user_id AND m.server_id = v_item.server_id
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'You must claim your profile first'; END IF;
  v_server_id := v_item.server_id;

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
        'Your bid of ' || v_prev_highest.bid_amount || ' DKP on "' || COALESCE(v_item.name, 'Unknown item') || '" was outbid. Your DKP has been refunded.',
        jsonb_build_object('item_id', p_item_id, 'outbid_amount', v_prev_highest.bid_amount, 'new_bid_amount', p_amount));
    END IF;
  END IF;

  INSERT INTO public.dkp_bids (server_id, item_id, member_id, bid_amount, status, auction_round)
  VALUES (v_server_id, p_item_id, v_member_id, p_amount, 'active', v_item.auction_round)
  RETURNING id INTO v_bid_id;

  INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
  VALUES (v_server_id, v_member_id, -p_amount, 'spend_bid', 'Bid ' || p_amount || ' DKP', v_bid_id, 'bid');

  v_remaining_secs := EXTRACT(EPOCH FROM (v_item.bid_end_time - now()));
  IF v_remaining_secs < 180 THEN
    UPDATE public.items SET bid_end_time = now() + INTERVAL '3 minutes' WHERE id = p_item_id;
  END IF;

  RETURN v_bid_id;
END;
$$;

-- ── Updated auto_resolve_auction: C4 — refund losers properly + C3 notifications ──
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
  SELECT name, server_id INTO v_item_name, v_server_id FROM public.items WHERE id = p_item_id;

  SELECT id, member_id, bid_amount INTO v_winner_bid_id, v_winner_member_id, v_winner_amount
  FROM public.dkp_bids
  WHERE item_id = p_item_id AND status = 'active'
  ORDER BY bid_amount DESC, created_at ASC
  LIMIT 1;

  IF v_winner_bid_id IS NOT NULL THEN
    UPDATE public.dkp_bids SET status = 'won', resolved_at = now() WHERE id = v_winner_bid_id;

    SELECT m.user_id INTO v_winner_user_id FROM public.members m WHERE m.id = v_winner_member_id;
    IF v_winner_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, server_id, type, title, body, metadata)
      VALUES (v_winner_user_id, v_server_id, 'dkp_won',
        'You won the auction!',
        'You won "' || COALESCE(v_item_name, 'Unknown item') || '" for ' || v_winner_amount || ' DKP.',
        jsonb_build_object('item_id', p_item_id, 'item_name', v_item_name, 'winning_bid', v_winner_amount));
    END IF;
  END IF;

  -- C4 FIX: Refund all remaining active bids (losers) before marking them cancelled
  FOR v_bid IN
    SELECT b.id, b.member_id, b.bid_amount, m.user_id
    FROM public.dkp_bids b
    JOIN public.members m ON m.id = b.member_id
    WHERE b.item_id = p_item_id AND b.status = 'active' AND b.id != v_winner_bid_id
  LOOP
    -- Insert refund transaction
    INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
    VALUES (v_server_id, v_bid.member_id, v_bid.bid_amount, 'earn_refund', 'Auction ended', v_bid.id, 'bid');

    IF v_bid.user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, server_id, type, title, body, metadata)
      VALUES (v_bid.user_id, v_server_id, 'dkp_lost',
        'Auction ended — you did not win',
        'You did not win "' || COALESCE(v_item_name, 'Unknown item') || '". Your DKP has been refunded.',
        jsonb_build_object('item_id', p_item_id, 'item_name', v_item_name));
    END IF;
  END LOOP;

  -- Mark all remaining active bids as cancelled (losers already refunded above)
  UPDATE public.dkp_bids SET status = 'cancelled', resolved_at = now()
  WHERE item_id = p_item_id AND status = 'active';

  UPDATE public.items SET is_up_for_bid = false, bid_end_time = NULL WHERE id = p_item_id;
END;
$$;

-- ── Updated resolve_auction: C3 — add notifications for winner/loser/cancelled ──
DROP FUNCTION IF EXISTS public.resolve_auction(uuid, uuid);
CREATE OR REPLACE FUNCTION public.resolve_auction(p_item_id UUID, p_winner_bid_id UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_bid RECORD;
  v_server_id UUID;
  v_item_name TEXT;
  v_winner_user_id UUID;
  v_winner_amount INTEGER;
BEGIN
  SELECT server_id, name INTO v_server_id, v_item_name FROM public.items WHERE id = p_item_id FOR UPDATE;

  IF p_winner_bid_id IS NULL THEN
    -- Cancel all active bids
    FOR v_bid IN SELECT b.*, m.user_id FROM public.dkp_bids b JOIN public.members m ON m.id = b.member_id WHERE b.item_id = p_item_id AND b.status = 'active'
    LOOP
      INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
      VALUES (v_server_id, v_bid.member_id, v_bid.bid_amount, 'earn_refund', 'Auction cancelled', v_bid.id, 'bid');
      UPDATE public.dkp_bids SET status = 'cancelled', resolved_at = now() WHERE id = v_bid.id;

      -- C3: Notify cancelled bidders
      IF v_bid.user_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, server_id, type, title, body, metadata)
        VALUES (v_bid.user_id, v_server_id, 'dkp_lost',
          'Auction cancelled',
          'The auction for "' || COALESCE(v_item_name, 'Unknown item') || '" was cancelled. Your DKP has been refunded.',
          jsonb_build_object('item_id', p_item_id, 'item_name', v_item_name));
      END IF;
    END LOOP;
  ELSE
    -- Award winner
    SELECT bid_amount INTO v_winner_amount FROM public.dkp_bids WHERE id = p_winner_bid_id;
    UPDATE public.dkp_bids SET status = 'won', resolved_at = now() WHERE id = p_winner_bid_id;

    -- C3: Notify winner
    SELECT m.user_id INTO v_winner_user_id FROM public.members m WHERE m.id = (SELECT member_id FROM public.dkp_bids WHERE id = p_winner_bid_id);
    IF v_winner_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, server_id, type, title, body, metadata)
      VALUES (v_winner_user_id, v_server_id, 'dkp_won',
        'You won the auction!',
        'You won "' || COALESCE(v_item_name, 'Unknown item') || '" for ' || COALESCE(v_winner_amount, 0) || ' DKP.',
        jsonb_build_object('item_id', p_item_id, 'item_name', v_item_name, 'winning_bid', v_winner_amount));
    END IF;

    -- Refund and notify losers
    FOR v_bid IN SELECT b.*, m.user_id FROM public.dkp_bids b JOIN public.members m ON m.id = b.member_id WHERE b.item_id = p_item_id AND b.status = 'active' AND b.id != p_winner_bid_id
    LOOP
      INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
      VALUES (v_server_id, v_bid.member_id, v_bid.bid_amount, 'earn_refund', 'Bid lost', v_bid.id, 'bid');
      UPDATE public.dkp_bids SET status = 'lost', resolved_at = now() WHERE id = v_bid.id;

      IF v_bid.user_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, server_id, type, title, body, metadata)
        VALUES (v_bid.user_id, v_server_id, 'dkp_lost',
          'Auction ended — you did not win',
          'You did not win "' || COALESCE(v_item_name, 'Unknown item') || '". Your DKP has been refunded.',
          jsonb_build_object('item_id', p_item_id, 'item_name', v_item_name));
      END IF;
    END LOOP;
  END IF;

  UPDATE public.items SET is_up_for_bid = false, bid_end_time = NULL WHERE id = p_item_id;
END;
$$;

-- ── C5: Updated delete_auction_round to cleanup dkp_distributed ──
DROP FUNCTION IF EXISTS public.delete_auction_round(uuid, integer);
CREATE OR REPLACE FUNCTION public.delete_auction_round(
  p_item_id UUID,
  p_auction_round INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_bid_ids UUID[];
BEGIN
  -- Get all bid IDs for this round
  SELECT array_agg(id) INTO v_bid_ids FROM public.dkp_bids
  WHERE item_id = p_item_id AND auction_round = p_auction_round;

  -- Delete transactions referencing these bids
  IF v_bid_ids IS NOT NULL THEN
    DELETE FROM public.dkp_transactions
    WHERE reference_id = ANY(v_bid_ids) AND reference_type = 'bid';
  END IF;

  -- Delete the bids
  DELETE FROM public.dkp_bids
  WHERE item_id = p_item_id AND auction_round = p_auction_round;

  -- C5 FIX: Cleanup distributed status
  DELETE FROM public.dkp_distributed
  WHERE item_id = p_item_id AND auction_round = p_auction_round;
END;
$$;
