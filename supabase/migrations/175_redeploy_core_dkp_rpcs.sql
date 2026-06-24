-- 175: Re-deploy all core DKP RPCs that may be missing on remote
-- award_dkp_on_kill was already re-created in 174, adding the rest here

-- adjust_member_dkp
CREATE OR REPLACE FUNCTION public.adjust_member_dkp(
  p_member_id UUID,
  p_server_id UUID,
  p_amount INTEGER,
  p_reason TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_txn_id UUID;
BEGIN
  INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_type)
  VALUES (p_server_id, p_member_id, p_amount, 'earn_adjustment', p_reason, 'manual')
  RETURNING id INTO v_txn_id;
  RETURN v_txn_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_member_dkp(UUID, UUID, INTEGER, TEXT) TO authenticated;

-- get_member_dkp
CREATE OR REPLACE FUNCTION public.get_member_dkp(
  p_member_id UUID,
  p_server_id UUID
)
RETURNS TABLE(balance BIGINT, earned_total BIGINT, spent_total BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    COALESCE(SUM(amount), 0)::BIGINT AS balance,
    COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0)::BIGINT AS earned_total,
    COALESCE(SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END), 0)::BIGINT AS spent_total
  FROM public.dkp_transactions
  WHERE member_id = p_member_id AND server_id = p_server_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_dkp(UUID, UUID) TO authenticated;

-- get_server_dkp_rankings
CREATE OR REPLACE FUNCTION public.get_server_dkp_rankings(p_server_id UUID)
RETURNS TABLE(
  member_id UUID,
  member_name TEXT,
  balance BIGINT,
  rank INTEGER,
  guild_name TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    m.id AS member_id, m.name AS member_name, COALESCE(db.balance, 0)::BIGINT AS balance,
    ROW_NUMBER() OVER (ORDER BY COALESCE(db.balance, 0) DESC)::INTEGER AS rank,
    g.name AS guild_name
  FROM public.members m
  LEFT JOIN public.dkp_balances db ON db.member_id = m.id AND db.server_id = p_server_id
  LEFT JOIN public.guilds g ON g.id = m.guild_id
  WHERE m.server_id = p_server_id
  ORDER BY COALESCE(db.balance, 0) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_server_dkp_rankings(UUID) TO authenticated;

-- resolve_auction
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
  v_item_image_url TEXT;
  v_winner_user_id UUID;
  v_winner_amount INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.dkp_auctions WHERE id = p_auction_id AND status = 'active') THEN
    RETURN;
  END IF;

  SELECT a.server_id, a.item_id, i.name, i.image_url
  INTO v_server_id, v_item_id, v_item_name, v_item_image_url
  FROM public.dkp_auctions a JOIN public.items i ON i.id = a.item_id
  WHERE a.id = p_auction_id FOR UPDATE;

  IF NOT EXISTS (SELECT 1 FROM public.dkp_auctions WHERE id = p_auction_id AND status = 'active') THEN
    RETURN;
  END IF;

  IF p_winner_bid_id IS NULL THEN
    FOR v_bid IN SELECT b.*, m.user_id FROM public.dkp_bids b JOIN public.members m ON m.id = b.member_id WHERE b.auction_id = p_auction_id AND b.status = 'active'
    LOOP
      INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
      VALUES (v_server_id, v_bid.member_id, v_bid.bid_amount, 'earn_refund', 'Auction cancelled', v_bid.id, 'bid');
      UPDATE public.dkp_bids SET status = 'cancelled', resolved_at = now() WHERE id = v_bid.id;
    END LOOP;
  ELSE
    SELECT bid_amount INTO v_winner_amount FROM public.dkp_bids WHERE id = p_winner_bid_id;
    UPDATE public.dkp_bids SET status = 'won', resolved_at = now() WHERE id = p_winner_bid_id;

    FOR v_bid IN SELECT b.* FROM public.dkp_bids b WHERE b.auction_id = p_auction_id AND b.status = 'active' AND b.id != p_winner_bid_id
    LOOP
      INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
      VALUES (v_server_id, v_bid.member_id, v_bid.bid_amount, 'earn_refund', 'Bid lost', v_bid.id, 'bid');
      UPDATE public.dkp_bids SET status = 'lost', resolved_at = now() WHERE id = v_bid.id;
    END LOOP;
  END IF;

  UPDATE public.dkp_auctions SET status = 'resolved' WHERE id = p_auction_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_auction(UUID, UUID) TO authenticated;

-- place_bid
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
BEGIN
  SELECT a.id, a.item_id, a.dkp_cost, a.bid_end_time, a.server_id, a.guild_id, a.status,
         i.name AS item_name, i.image_url AS item_image_url
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

GRANT EXECUTE ON FUNCTION public.place_bid(UUID, INTEGER) TO authenticated;
