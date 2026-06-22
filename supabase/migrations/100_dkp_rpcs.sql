-- 100: DKP RPCs — earning, bidding, queries

-- 1. Award DKP on kill (idempotent)
CREATE OR REPLACE FUNCTION public.award_dkp_on_kill(p_death_record_id UUID)
RETURNS SETOF UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_server_id UUID;
  v_boss_points INTEGER;
  v_multiplier REAL;
  v_amount INTEGER;
  v_attendee RECORD;
  v_existing RECORD;
  v_txn_id UUID;
BEGIN
  -- Get death record info
  SELECT dr.server_id, COALESCE(b.boss_points, 1)
  INTO v_server_id, v_boss_points
  FROM public.death_records dr
  JOIN public.bosses b ON b.id = dr.boss_id
  WHERE dr.id = p_death_record_id;

  IF NOT FOUND THEN RETURN; END IF;

  -- Get DKP multiplier
  SELECT COALESCE(dkp_multiplier, 1.0) INTO v_multiplier
  FROM public.dkp_config WHERE server_id = v_server_id;

  IF NOT FOUND OR v_multiplier = 0 THEN RETURN; END IF;

  v_amount := ROUND(v_boss_points * v_multiplier);

  -- Diff current attendance vs previously awarded
  FOR v_attendee IN
    SELECT ar.member_id
    FROM public.attendance_records ar
    WHERE ar.death_record_id = p_death_record_id
  LOOP
    -- Check if already awarded
    SELECT id INTO v_existing
    FROM public.dkp_transactions
    WHERE reference_id = p_death_record_id
      AND reference_type = 'death_record'
      AND member_id = v_attendee.member_id
      AND type = 'earn_kill'
    LIMIT 1;

    IF v_existing.id IS NULL THEN
      -- New attendee: award DKP
      INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
      VALUES (v_server_id, v_attendee.member_id, v_amount, 'earn_kill', 'Boss kill', p_death_record_id, 'death_record')
      RETURNING id INTO v_txn_id;
      RETURN NEXT v_txn_id;
    END IF;
  END LOOP;

  -- Remove DKP from attendees no longer present
  FOR v_existing IN
    SELECT dt.id, dt.member_id, dt.amount
    FROM public.dkp_transactions dt
    WHERE dt.reference_id = p_death_record_id
      AND dt.reference_type = 'death_record'
      AND dt.type = 'earn_kill'
      AND dt.member_id NOT IN (
        SELECT ar.member_id FROM public.attendance_records ar WHERE ar.death_record_id = p_death_record_id
      )
  LOOP
    -- Deduct previously awarded DKP
    INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
    VALUES (v_server_id, v_existing.member_id, -v_existing.amount, 'earn_adjustment', 'Removed from attendance', p_death_record_id, 'death_record')
    RETURNING id INTO v_txn_id;
    RETURN NEXT v_txn_id;
  END LOOP;
END;
$$;

-- 2. Manual DKP adjustment
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

-- 3. Mark item for bid
CREATE OR REPLACE FUNCTION public.mark_item_for_bid(
  p_item_id UUID,
  p_dkp_cost INTEGER,
  p_duration_minutes INTEGER DEFAULT 30
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.items 
  SET is_up_for_bid = true, 
      dkp_cost = p_dkp_cost, 
      bid_end_time = now() + (p_duration_minutes || ' minutes')::INTERVAL
  WHERE id = p_item_id;
END;
$$;

-- 4. Unmark item from bid (refunds all active bidders)
CREATE OR REPLACE FUNCTION public.unmark_item_from_bid(p_item_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_bid RECORD;
  v_server_id UUID;
BEGIN
  SELECT server_id INTO v_server_id FROM public.items WHERE id = p_item_id;

  -- Refund all active bids
  FOR v_bid IN
    SELECT id, member_id, bid_amount FROM public.dkp_bids
    WHERE item_id = p_item_id AND status = 'active'
  LOOP
    INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
    VALUES (v_server_id, v_bid.member_id, v_bid.bid_amount, 'earn_refund', 'Auction cancelled', v_bid.id, 'bid');

    UPDATE public.dkp_bids SET status = 'cancelled', resolved_at = now() WHERE id = v_bid.id;
  END LOOP;

  -- Clear item bid flags
  UPDATE public.items SET is_up_for_bid = false, dkp_cost = NULL, bid_end_time = NULL WHERE id = p_item_id;
END;
$$;

-- 5. Place a bid (deducts DKP immediately)
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
  v_balance INTEGER;
  v_bid_id UUID;
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

  -- Refund existing bid if any
  IF v_existing_bid.id IS NOT NULL THEN
    INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
    VALUES (v_server_id, v_member_id, v_existing_bid.bid_amount, 'earn_refund', 'Bid changed', v_existing_bid.id, 'bid');
    UPDATE public.dkp_bids SET status = 'cancelled', resolved_at = now() WHERE id = v_existing_bid.id;
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

  RETURN v_bid_id;
END;
$$;

-- 6. Cancel own bid
CREATE OR REPLACE FUNCTION public.cancel_bid(p_bid_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_bid RECORD;
  v_server_id UUID;
BEGIN
  SELECT b.id, b.member_id, b.bid_amount, b.status, m.server_id
  INTO v_bid
  FROM public.dkp_bids b
  JOIN public.members m ON m.id = b.member_id
  WHERE b.id = p_bid_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Bid not found'; END IF;
  IF v_bid.status != 'active' THEN RAISE EXCEPTION 'Bid is not active'; END IF;

  -- Refund DKP
  INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
  VALUES (v_bid.server_id, v_bid.member_id, v_bid.bid_amount, 'earn_refund', 'Bid cancelled', p_bid_id, 'bid');

  UPDATE public.dkp_bids SET status = 'cancelled', resolved_at = now() WHERE id = p_bid_id;
END;
$$;

-- 7. Get item bids (officer only, amounts hidden if silent)
CREATE OR REPLACE FUNCTION public.get_item_bids(p_item_id UUID)
RETURNS TABLE(
  id UUID,
  member_name TEXT,
  bid_amount INTEGER,
  status TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 
    b.id, m.name AS member_name, b.bid_amount, b.status, b.created_at
  FROM public.dkp_bids b
  JOIN public.members m ON m.id = b.member_id
  WHERE b.item_id = p_item_id
  ORDER BY b.bid_amount DESC;
$$;

-- 8. Resolve auction
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
    -- Cancel auction entirely
    FOR v_bid IN SELECT * FROM public.dkp_bids WHERE item_id = p_item_id AND status = 'active'
    LOOP
      INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
      VALUES (v_server_id, v_bid.member_id, v_bid.bid_amount, 'earn_refund', 'Auction cancelled', v_bid.id, 'bid');
      UPDATE public.dkp_bids SET status = 'cancelled', resolved_at = now() WHERE id = v_bid.id;
    END LOOP;
  ELSE
    -- Award winner
    UPDATE public.dkp_bids SET status = 'won', resolved_at = now() WHERE id = p_winner_bid_id;

    -- Refund losers
    FOR v_bid IN SELECT * FROM public.dkp_bids WHERE item_id = p_item_id AND status = 'active' AND id != p_winner_bid_id
    LOOP
      INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
      VALUES (v_server_id, v_bid.member_id, v_bid.bid_amount, 'earn_refund', 'Bid lost', v_bid.id, 'bid');
      UPDATE public.dkp_bids SET status = 'lost', resolved_at = now() WHERE id = v_bid.id;
    END LOOP;
  END IF;

  -- Clear item bid flags
  UPDATE public.items SET is_up_for_bid = false, dkp_cost = NULL, bid_end_time = NULL WHERE id = p_item_id;
END;
$$;

-- 9. Get member DKP
CREATE OR REPLACE FUNCTION public.get_member_dkp(p_member_id UUID, p_server_id UUID)
RETURNS TABLE(balance BIGINT, earned_this_week BIGINT, spent_this_week BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 
    COALESCE(SUM(amount), 0)::BIGINT AS balance,
    COALESCE(SUM(CASE WHEN amount > 0 AND created_at > now() - INTERVAL '7 days' THEN amount ELSE 0 END), 0)::BIGINT AS earned_this_week,
    COALESCE(SUM(CASE WHEN amount < 0 AND created_at > now() - INTERVAL '7 days' THEN -amount ELSE 0 END), 0)::BIGINT AS spent_this_week
  FROM public.dkp_transactions
  WHERE member_id = p_member_id AND server_id = p_server_id;
$$;

-- 10. Get server DKP rankings
CREATE OR REPLACE FUNCTION public.get_server_dkp_rankings(p_server_id UUID)
RETURNS TABLE(
  member_id UUID,
  member_name TEXT,
  balance BIGINT,
  rank INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 
    db.member_id, m.name AS member_name, db.balance::BIGINT,
    ROW_NUMBER() OVER (ORDER BY db.balance DESC)::INTEGER AS rank
  FROM public.dkp_balances db
  JOIN public.members m ON m.id = db.member_id
  WHERE db.server_id = p_server_id AND db.balance > 0
  ORDER BY db.balance DESC
  LIMIT 100;
$$;

-- 11. Get active bids for a server
CREATE OR REPLACE FUNCTION public.get_active_bids(p_server_id UUID)
RETURNS TABLE(
  id UUID,
  item_id UUID,
  item_name TEXT,
  member_name TEXT,
  bid_amount INTEGER,
  status TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 
    b.id, b.item_id, i.name AS item_name, m.name AS member_name,
    b.bid_amount, b.status, b.created_at
  FROM public.dkp_bids b
  JOIN public.items i ON i.id = b.item_id
  JOIN public.members m ON m.id = b.member_id
  WHERE b.server_id = p_server_id AND b.status = 'active'
  ORDER BY b.created_at DESC;
$$;

-- 12. Get member DKP history (paginated)
CREATE OR REPLACE FUNCTION public.get_member_dkp_history(
  p_member_id UUID,
  p_server_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_cursor TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  amount INTEGER,
  type TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id, amount, type, reason, created_at
  FROM public.dkp_transactions
  WHERE member_id = p_member_id AND server_id = p_server_id
    AND (p_cursor IS NULL OR created_at < p_cursor)
  ORDER BY created_at DESC
  LIMIT p_limit;
$$;
