-- Bidding scalability, part 2: the bid path and its realtime plumbing.
--
-- The old flow: place_bid wrote rows → postgres_changes decoded every row for
-- every subscriber (RLS re-checked per subscriber per row, unfiltered across all
-- servers) → every client invalidated 4-9 React Query keys → every client fired
-- ~5 HTTP refetches. Database load scaled as players × bids/sec.
--
-- The new flow: place_bid computes the complete post-bid auction state while it
-- holds the auction lock, broadcasts one compact event on the server's private
-- topic (authorization checked once per channel join, not per message), and
-- returns the same payload to the bidding client. Nobody refetches anything.
--
-- Also fixed here, because the rewrite is the right place to fix them:
--
--   * DETHRONING BUG: the old place_bid accepted any amount >= dkp_cost and
--     unconditionally refunded + marked lost the previous highest bidder — a
--     LOWER bid stole the auction. Bids must now strictly exceed the current
--     highest (or meet dkp_cost when there is none).
--
--   * CROSS-AUCTION OVERSPEND: the old function locked the auction but read the
--     balance without locking it, so one member bidding concurrently on two
--     auctions could spend the same DKP twice. The balance row is now locked
--     (FOR UPDATE) before validation; concurrent spends by one member serialize.
--
-- Lock ordering everywhere is auction → member balance rows. Two bids on one
-- auction serialize entirely at the auction lock; one member's bids on two
-- auctions serialize at their balance row. A resolve refunding many members
-- concurrent with a bid refunding another can, in principle, deadlock; Postgres
-- aborts one with 40P01 and the client maps it to a retryable CONCURRENT_CONFLICT.
--
-- Multi-quantity note: resolve_auction awards exactly one winner and the ladder
-- keeps one active bid, so quantity is informational (staff duplicate/distribute
-- per copy). This migration preserves those semantics; it does not invent
-- multi-winner bidding.

-- ── Broadcast authorization: one policy, checked at channel join ────────────

CREATE POLICY "Server members join dkp topics" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND left(realtime.topic(), 4) = 'dkp:'
    AND EXISTS (
      SELECT 1 FROM public.server_members sm
      WHERE sm.user_id = (SELECT auth.uid())
        AND sm.server_id::text = split_part(realtime.topic(), ':', 2)
    )
  );

-- ── Broadcast helper: a bid must never fail because realtime hiccuped ───────

CREATE OR REPLACE FUNCTION public.dkp_broadcast(p_server_id UUID, p_event TEXT, p_payload JSONB)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  PERFORM realtime.send(p_payload, p_event, 'dkp:' || p_server_id::text, true);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'dkp_broadcast failed for server % event %: %', p_server_id, p_event, SQLERRM;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dkp_broadcast(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- ── place_bid v3 ────────────────────────────────────────────────────────────

-- Return type changes uuid → jsonb (the bid event), so the old function must go.
-- The deployed frontend ignores place_bid's return value, so this is deploy-safe.
DROP FUNCTION IF EXISTS public.place_bid(UUID, INTEGER);

CREATE FUNCTION public.place_bid(p_auction_id UUID, p_amount INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_member_id UUID;
  v_member_name TEXT;
  v_server_id UUID;
  v_auction RECORD;
  v_existing_bid RECORD;
  v_prev_highest RECORD;
  v_balance BIGINT;
  v_required INTEGER;
  v_bid_id UUID;
  v_remaining_secs INTEGER;
  v_extend_secs INTEGER;
  v_new_end TIMESTAMPTZ;
  v_new_count INTEGER;
  v_outbid_user_id UUID;
  v_payload JSONB;
BEGIN
  -- Errors carry machine-readable prefixes (before the colon) that the client
  -- maps to distinct UI states. Human-readable detail follows the colon.
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 100000000 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: bid amount must be between 1 and 100,000,000';
  END IF;

  -- Lock the auction first: this serializes every bid on it, making the
  -- validate → dethrone → insert → soft-close sequence atomic per auction.
  SELECT a.id, a.item_id, a.dkp_cost, a.bid_end_time, a.server_id, a.guild_id,
         a.status, a.highest_bid, a.highest_bidder_id, a.bid_count,
         i.name AS item_name, i.image_url AS item_image_url
  INTO v_auction
  FROM public.dkp_auctions a
  JOIN public.items i ON i.id = a.item_id
  WHERE a.id = p_auction_id
  FOR UPDATE OF a;

  IF NOT FOUND THEN RAISE EXCEPTION 'AUCTION_NOT_FOUND: auction does not exist'; END IF;
  IF v_auction.status != 'active' OR v_auction.bid_end_time < now() THEN
    RAISE EXCEPTION 'AUCTION_CLOSED: bidding has ended';
  END IF;

  v_server_id := v_auction.server_id;

  SELECT m.id, m.name INTO v_member_id, v_member_name
  FROM public.members m
  WHERE m.user_id = v_user_id AND m.server_id = v_server_id
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_CLAIMED: claim your member profile before bidding'; END IF;

  IF v_auction.guild_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.members m WHERE m.id = v_member_id AND m.guild_id = v_auction.guild_id
  ) THEN
    RAISE EXCEPTION 'GUILD_RESTRICTED: this auction is restricted to guild members';
  END IF;

  -- Bids must strictly beat the standing highest. This is the dethroning fix:
  -- previously any amount >= dkp_cost displaced the leader, even a lower one.
  v_required := CASE WHEN v_auction.highest_bid > 0
                     THEN v_auction.highest_bid + 1
                     ELSE GREATEST(COALESCE(v_auction.dkp_cost, 1), 1) END;
  IF p_amount < v_required THEN
    RAISE EXCEPTION 'BID_TOO_LOW: current highest is % — bid at least %',
      v_auction.highest_bid, v_required;
  END IF;

  -- Lock the member's balance row before validating funds. This is the
  -- cross-auction fix: a member's concurrent bids serialize here, so the second
  -- one sees the first one's deduction. The row is created on first touch so
  -- there is always something to lock.
  INSERT INTO public.dkp_balances (member_id, server_id, balance)
  VALUES (v_member_id, v_server_id, 0)
  ON CONFLICT (member_id, server_id) DO NOTHING;

  SELECT balance INTO v_balance
  FROM public.dkp_balances
  WHERE member_id = v_member_id AND server_id = v_server_id
  FOR UPDATE;

  -- A replaced own bid returns to the pool as part of this transaction.
  SELECT id, bid_amount INTO v_existing_bid
  FROM public.dkp_bids
  WHERE auction_id = p_auction_id AND member_id = v_member_id AND status = 'active'
  LIMIT 1;
  IF v_existing_bid.id IS NOT NULL THEN
    v_balance := v_balance + v_existing_bid.bid_amount;
  END IF;

  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_DKP: you have % DKP available', v_balance;
  END IF;

  -- Previous highest bidder (never the caller — their own bid is replaced above).
  SELECT id, member_id, bid_amount INTO v_prev_highest
  FROM public.dkp_bids
  WHERE auction_id = p_auction_id AND status = 'active' AND member_id != v_member_id
  ORDER BY bid_amount DESC, created_at ASC
  LIMIT 1;

  -- Replace own bid, if any.
  IF v_existing_bid.id IS NOT NULL THEN
    INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
    VALUES (v_server_id, v_member_id, v_existing_bid.bid_amount, 'earn_refund', 'Bid changed', v_existing_bid.id, 'bid');
    UPDATE public.dkp_bids SET status = 'cancelled', resolved_at = now() WHERE id = v_existing_bid.id;
  END IF;

  -- Dethrone and refund the outbid leader.
  IF v_prev_highest.id IS NOT NULL THEN
    INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
    VALUES (v_server_id, v_prev_highest.member_id, v_prev_highest.bid_amount, 'earn_refund', 'Outbid', v_prev_highest.id, 'bid');
    UPDATE public.dkp_bids SET status = 'lost', resolved_at = now() WHERE id = v_prev_highest.id;

    SELECT m.user_id INTO v_outbid_user_id FROM public.members m WHERE m.id = v_prev_highest.member_id;
    IF v_outbid_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, server_id, type, title, body, metadata)
      VALUES (v_outbid_user_id, v_server_id, 'dkp_outbid',
        'You were outbid!',
        'Your bid of ' || v_prev_highest.bid_amount || ' DKP on "' || COALESCE(v_auction.item_name, 'Unknown item')
          || '" was outbid by ' || p_amount || ' DKP. Your ' || v_prev_highest.bid_amount
          || ' DKP has been refunded — you can bid again.',
        jsonb_build_object('auction_id', p_auction_id, 'outbid_amount', v_prev_highest.bid_amount,
                           'new_bid_amount', p_amount, 'item_name', v_auction.item_name,
                           'image_url', v_auction.item_image_url));
    END IF;
  END IF;

  -- The bid and its escrow.
  INSERT INTO public.dkp_bids (server_id, item_id, auction_id, member_id, bid_amount, status, auction_round)
  VALUES (v_server_id, v_auction.item_id, p_auction_id, v_member_id, p_amount, 'active', 1)
  RETURNING id INTO v_bid_id;

  INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
  VALUES (v_server_id, v_member_id, -p_amount, 'spend_bid', 'Bid ' || p_amount || ' DKP', v_bid_id, 'bid');

  -- Soft close: a bid inside the last 3 minutes pushes the deadline out by a
  -- random 180-300s. Atomic with the bid because the auction row is locked.
  v_remaining_secs := EXTRACT(EPOCH FROM (v_auction.bid_end_time - now()));
  IF v_remaining_secs < 180 THEN
    v_extend_secs := floor(random() * 121)::int + 180;
    v_new_end := now() + make_interval(secs => v_extend_secs);
  END IF;

  v_new_count := v_auction.bid_count + 1;

  UPDATE public.dkp_auctions
  SET highest_bid = p_amount,
      highest_bidder_id = v_member_id,
      bid_count = v_new_count,
      bid_end_time = COALESCE(v_new_end, bid_end_time)
  WHERE id = p_auction_id;

  -- One compact event: everything a client needs to update local state, nothing
  -- about unrelated members, auctions, or servers. Returned to the bidder and
  -- broadcast to the server topic (clients de-duplicate by bidCount).
  v_payload := jsonb_build_object(
    'auctionId', p_auction_id,
    'itemId', v_auction.item_id,
    'itemName', v_auction.item_name,
    'bidId', v_bid_id,
    'bidderId', v_member_id,
    'bidderName', v_member_name,
    'amount', p_amount,
    'highestBid', p_amount,
    'bidCount', v_new_count,
    'previousBidderId', v_prev_highest.member_id,
    'previousBidderRefund', v_prev_highest.bid_amount,
    'bidEndTime', COALESCE(v_new_end, v_auction.bid_end_time),
    'serverId', v_server_id,
    'ts', now()
  );

  PERFORM public.dkp_broadcast(v_server_id, 'bid', v_payload);

  RETURN v_payload;
END;
$$;

-- Supabase default privileges grant EXECUTE broadly on new functions; the old
-- place_bid was even executable by anon (harmless — auth.uid() is null — but
-- wrong). Authenticated only.
REVOKE EXECUTE ON FUNCTION public.place_bid(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_bid(UUID, INTEGER) TO authenticated;

-- ── cancel_bid: keep the denormalized auction state true ────────────────────

CREATE OR REPLACE FUNCTION public.cancel_bid(p_bid_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_bid RECORD;
  v_next RECORD;
BEGIN
  SELECT b.id, b.member_id, b.bid_amount, b.status, b.auction_id, m.server_id
  INTO v_bid
  FROM public.dkp_bids b
  JOIN public.members m ON m.id = b.member_id
  WHERE b.id = p_bid_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Bid not found'; END IF;
  IF v_bid.status != 'active' THEN RAISE EXCEPTION 'Bid is not active'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = v_bid.member_id AND m.user_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM public.server_members sm
    WHERE sm.server_id = v_bid.server_id AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'moderator')
  ) THEN
    RAISE EXCEPTION 'You can only cancel your own bids';
  END IF;

  -- Same lock order as place_bid: auction first.
  IF v_bid.auction_id IS NOT NULL THEN
    PERFORM 1 FROM public.dkp_auctions WHERE id = v_bid.auction_id FOR UPDATE;
  END IF;

  INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
  VALUES (v_bid.server_id, v_bid.member_id, v_bid.bid_amount, 'earn_refund', 'Bid cancelled', p_bid_id, 'bid');

  UPDATE public.dkp_bids SET status = 'cancelled', resolved_at = now() WHERE id = p_bid_id;

  -- Recompute the ladder top from the remaining active bids.
  IF v_bid.auction_id IS NOT NULL THEN
    SELECT member_id, bid_amount INTO v_next
    FROM public.dkp_bids
    WHERE auction_id = v_bid.auction_id AND status = 'active'
    ORDER BY bid_amount DESC, created_at ASC
    LIMIT 1;

    UPDATE public.dkp_auctions
    SET highest_bid = COALESCE(v_next.bid_amount, 0),
        highest_bidder_id = v_next.member_id,
        bid_count = GREATEST(bid_count - 1, 0)
    WHERE id = v_bid.auction_id;

    -- Rare event: a plain sync beat is enough, clients refetch the small list.
    PERFORM public.dkp_broadcast(v_bid.server_id, 'sync',
      jsonb_build_object('kind', 'bid_cancelled', 'auctionId', v_bid.auction_id));
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_bid(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_bid(UUID) TO authenticated;

-- ── Auction lifecycle beats (rare, so clients may refetch on them) ──────────

-- mark_item_for_bid: unchanged except the trailing broadcast.
CREATE OR REPLACE FUNCTION public.mark_item_for_bid(
  p_item_id UUID, p_dkp_cost INTEGER,
  p_bid_end_time TIMESTAMPTZ DEFAULT NULL, p_duration_minutes INTEGER DEFAULT 30,
  p_guild_id UUID DEFAULT NULL, p_quantity INTEGER DEFAULT 1, p_server_id UUID DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_server_id UUID;
  v_auction_id UUID;
BEGIN
  SELECT server_id INTO v_server_id FROM public.items WHERE id = p_item_id;
  IF v_server_id IS NULL THEN
    v_server_id := p_server_id;
  END IF;
  IF v_server_id IS NULL THEN
    RAISE EXCEPTION 'Cannot determine server for this item';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.server_members
    WHERE user_id = auth.uid() AND server_id = v_server_id AND role IN ('owner', 'moderator')
  ) THEN
    RAISE EXCEPTION 'Staff access required';
  END IF;

  INSERT INTO public.dkp_auctions (item_id, server_id, dkp_cost, bid_end_time, guild_id, quantity)
  VALUES (p_item_id, v_server_id, p_dkp_cost,
          COALESCE(p_bid_end_time, now() + (p_duration_minutes || ' minutes')::INTERVAL),
          p_guild_id, GREATEST(p_quantity, 1))
  RETURNING id INTO v_auction_id;

  UPDATE public.items SET is_up_for_bid = true WHERE id = p_item_id;

  PERFORM public.dkp_broadcast(v_server_id, 'sync',
    jsonb_build_object('kind', 'auction_created', 'auctionId', v_auction_id));

  RETURN v_auction_id;
END;
$$;

-- resolve_auction: body unchanged except the terminal broadcasts.
CREATE OR REPLACE FUNCTION public.resolve_auction(p_auction_id UUID, p_winner_bid_id UUID DEFAULT NULL)
RETURNS void
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
  IF NOT EXISTS (SELECT 1 FROM public.dkp_auctions WHERE id = p_auction_id AND status = 'active') THEN
    RETURN;
  END IF;

  SELECT a.server_id, a.item_id, i.name INTO v_server_id, v_item_id, v_item_name
  FROM public.dkp_auctions a JOIN public.items i ON i.id = a.item_id
  WHERE a.id = p_auction_id FOR UPDATE;

  IF auth.role() != 'service_role' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.server_members
      WHERE user_id = auth.uid() AND server_id = v_server_id AND role IN ('owner', 'moderator')
    ) THEN
      RAISE EXCEPTION 'Staff access required';
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.dkp_auctions WHERE id = p_auction_id AND status = 'active') THEN
    RETURN;
  END IF;

  -- Re-check the deadline after the lock: a soft-close bid may have extended it
  -- since the cron picked this auction up. Automated path only — staff ending an
  -- auction early is deliberate.
  IF auth.role() = 'service_role'
     AND EXISTS (SELECT 1 FROM public.dkp_auctions WHERE id = p_auction_id AND bid_end_time > now()) THEN
    RETURN;
  END IF;

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
    SELECT bid_amount INTO v_winner_amount FROM public.dkp_bids
    WHERE id = p_winner_bid_id AND auction_id = p_auction_id AND status = 'active';

    IF NOT FOUND THEN
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

      UPDATE public.dkp_auctions SET status = 'resolved' WHERE id = p_auction_id;
      SELECT COUNT(*) INTO v_active_count FROM public.dkp_auctions WHERE item_id = v_item_id AND status = 'active';
      IF v_active_count = 0 THEN
        UPDATE public.items SET is_up_for_bid = false, bid_end_time = NULL WHERE id = v_item_id;
      END IF;
      PERFORM public.dkp_broadcast(v_server_id, 'sync',
        jsonb_build_object('kind', 'auction_resolved', 'auctionId', p_auction_id));
      RETURN;
    END IF;

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

  SELECT COUNT(*) INTO v_active_count FROM public.dkp_auctions WHERE item_id = v_item_id AND status = 'active';
  IF v_active_count = 0 THEN
    UPDATE public.items SET is_up_for_bid = false, bid_end_time = NULL WHERE id = v_item_id;
  END IF;

  PERFORM public.dkp_broadcast(v_server_id, 'sync',
    jsonb_build_object('kind', 'auction_resolved', 'auctionId', p_auction_id));
END;
$$;

-- ── Stop postgres_changes fan-out for DKP tables ───────────────────────────
--
-- With broadcast in place nothing subscribes to these via postgres_changes, and
-- leaving them published would keep the realtime WAL worker decoding 4-6 rows
-- per bid for nothing. Deployed clients on the old bundle degrade to
-- staleTime/focus refetching until the new frontend ships — brief and benign.

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['dkp_auctions','dkp_bids','dkp_transactions','dkp_distributed'] LOOP
    IF EXISTS (SELECT 1 FROM pg_publication_tables
               WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
