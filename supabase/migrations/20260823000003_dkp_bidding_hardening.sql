-- Bidding hardening: fixes for the residual issues the post-optimization audit
-- found. The event-driven architecture is preserved exactly; this migration
-- makes it deterministic, bounded, and consistent.
--
-- 1. get_auction_bids: the theater's initial load called get_active_bids, which
--    returns every active+lost bid on the server — measured 7,296 rows (~1 MB)
--    on the busiest server, growing forever. The theater shows ONE auction's
--    ladder; this fetches exactly that, keyset-paginated. get_active_bids stays
--    for the old bundle.
--
-- 2. bid_count invariant. Chosen definition: the number of bids standing in the
--    auction's competitive ladder — rows in status active/lost/won. A re-bid
--    replaces the member's own bid (old row → cancelled), so it must NOT grow
--    the count; place_bid v3 grew it anyway, and the backfill counted by the
--    ladder definition, so the two drifted. v4 increments only when the bid is
--    not a self-replacement; cancel_bid's decrement already matches; a resync
--    below repairs existing drift across all auctions.
--
-- 3. Deterministic lock order. v3 locked the bidder's balance row explicitly
--    but the outbid member's row implicitly (via the refund's ledger trigger),
--    and resolve_auction refunded members in bid order — two transactions could
--    acquire member locks in opposite orders and deadlock (40P01, retryable but
--    noisy under load). Now every path locks balance rows in ascending
--    member_id after taking its single auction lock: auction → members(sorted)
--    admits no cycles. (award_dkp_on_kill still locks in its own loop order; it
--    is attendance-path code outside this scope — documented, not changed.)
--
-- 4. Resolve/cancel events now carry enough state to patch caches (winner,
--    amount, refunded members, final count) instead of forcing every client to
--    refetch four query keys — the last O(N-clients) moment, which mass expiry
--    of same-deadline auctions could turn into a burst. The `kind` value stays
--    'auction_resolved' for both outcomes so the already-deployed bundle keeps
--    working; new clients read the `cancelled` flag.
--
-- 5. RLS initplan: the six surviving DKP policies re-created with
--    (select auth.uid()) — identical predicates, evaluated once per statement
--    instead of per row.

-- ── 1. Per-auction bid feed, keyset-paginated ───────────────────────────────

CREATE OR REPLACE FUNCTION public.get_auction_bids(
  p_auction_id UUID,
  p_limit INTEGER DEFAULT 100,
  p_before TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(id UUID, item_id UUID, item_name TEXT, auction_id UUID, member_id UUID,
              member_name TEXT, bid_amount INTEGER, status TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_server_id UUID;
BEGIN
  SELECT a.server_id INTO v_server_id FROM public.dkp_auctions a WHERE a.id = p_auction_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Auction not found'; END IF;

  -- Same gate as get_active_bids: server membership or admin.
  IF NOT EXISTS (
    SELECT 1 FROM public.server_members sm
    WHERE sm.server_id = v_server_id AND sm.user_id = (SELECT auth.uid())
  ) AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = (SELECT auth.uid()) AND ur.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT b.id, b.item_id, i.name, b.auction_id, b.member_id, m.name,
         b.bid_amount, b.status, b.created_at
  FROM public.dkp_bids b
  JOIN public.items i ON i.id = b.item_id
  JOIN public.members m ON m.id = b.member_id
  WHERE b.auction_id = p_auction_id
    AND b.status IN ('active', 'lost', 'won')
    AND (p_before IS NULL OR b.created_at < p_before)
  ORDER BY b.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_auction_bids(UUID, INTEGER, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_auction_bids(UUID, INTEGER, TIMESTAMPTZ) TO authenticated;

-- ── 2+3. place_bid v4: invariant-true bid_count, deterministic lock order ───

CREATE OR REPLACE FUNCTION public.place_bid(p_auction_id UUID, p_amount INTEGER)
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
  v_lock RECORD;
  v_balance BIGINT := NULL;
  v_required INTEGER;
  v_bid_id UUID;
  v_remaining_secs INTEGER;
  v_extend_secs INTEGER;
  v_new_end TIMESTAMPTZ;
  v_new_count INTEGER;
  v_outbid_user_id UUID;
  v_payload JSONB;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 100000000 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: bid amount must be between 1 and 100,000,000';
  END IF;

  -- Single auction lock: serializes every bid on this auction.
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

  v_required := CASE WHEN v_auction.highest_bid > 0
                     THEN v_auction.highest_bid + 1
                     ELSE GREATEST(COALESCE(v_auction.dkp_cost, 1), 1) END;
  IF p_amount < v_required THEN
    RAISE EXCEPTION 'BID_TOO_LOW: current highest is % — bid at least %',
      v_auction.highest_bid, v_required;
  END IF;

  -- The auction's bids cannot change while we hold its lock, so both of these
  -- are stable — and knowing them now lets us lock balance rows in one place.
  SELECT id, bid_amount INTO v_existing_bid
  FROM public.dkp_bids
  WHERE auction_id = p_auction_id AND member_id = v_member_id AND status = 'active'
  LIMIT 1;

  SELECT id, member_id, bid_amount INTO v_prev_highest
  FROM public.dkp_bids
  WHERE auction_id = p_auction_id AND status = 'active' AND member_id != v_member_id
  ORDER BY bid_amount DESC, created_at ASC
  LIMIT 1;

  -- Deterministic member-lock order: every balance row this transaction will
  -- touch (bidder's deduction, outbid member's refund) is locked here, in
  -- ascending member_id. All bid-path functions follow auction → members(asc),
  -- which admits no lock cycles.
  INSERT INTO public.dkp_balances (member_id, server_id, balance)
  VALUES (v_member_id, v_server_id, 0)
  ON CONFLICT (member_id, server_id) DO NOTHING;

  FOR v_lock IN
    SELECT b.member_id AS mid, b.balance
    FROM public.dkp_balances b
    WHERE b.server_id = v_server_id
      AND b.member_id IN (v_member_id, COALESCE(v_prev_highest.member_id, v_member_id))
    ORDER BY b.member_id
    FOR UPDATE
  LOOP
    IF v_lock.mid = v_member_id THEN v_balance := v_lock.balance; END IF;
  END LOOP;

  IF v_existing_bid.id IS NOT NULL THEN
    v_balance := v_balance + v_existing_bid.bid_amount;
  END IF;

  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_DKP: you have % DKP available', v_balance;
  END IF;

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
        'Your bid of ' || v_prev_highest.bid_amount || ' DKP on "' || COALESCE(v_auction.item_name, 'Unknown item')
          || '" was outbid by ' || p_amount || ' DKP. Your ' || v_prev_highest.bid_amount
          || ' DKP has been refunded — you can bid again.',
        jsonb_build_object('auction_id', p_auction_id, 'outbid_amount', v_prev_highest.bid_amount,
                           'new_bid_amount', p_amount, 'item_name', v_auction.item_name,
                           'image_url', v_auction.item_image_url));
    END IF;
  END IF;

  INSERT INTO public.dkp_bids (server_id, item_id, auction_id, member_id, bid_amount, status, auction_round)
  VALUES (v_server_id, v_auction.item_id, p_auction_id, v_member_id, p_amount, 'active', 1)
  RETURNING id INTO v_bid_id;

  INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
  VALUES (v_server_id, v_member_id, -p_amount, 'spend_bid', 'Bid ' || p_amount || ' DKP', v_bid_id, 'bid');

  v_remaining_secs := EXTRACT(EPOCH FROM (v_auction.bid_end_time - now()));
  IF v_remaining_secs < 180 THEN
    v_extend_secs := floor(random() * 121)::int + 180;
    v_new_end := now() + make_interval(secs => v_extend_secs);
  END IF;

  -- bid_count counts ladder rows (active/lost/won). A self-replacement swaps
  -- one row for another (old → cancelled), so the count moves only for a
  -- member's first standing bid.
  v_new_count := v_auction.bid_count + CASE WHEN v_existing_bid.id IS NULL THEN 1 ELSE 0 END;

  UPDATE public.dkp_auctions
  SET highest_bid = p_amount,
      highest_bidder_id = v_member_id,
      bid_count = v_new_count,
      bid_end_time = COALESCE(v_new_end, bid_end_time)
  WHERE id = p_auction_id;

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

-- ── Repair existing bid_count drift, everywhere, against the invariant ──────

UPDATE public.dkp_auctions a
SET bid_count = ladder.n
FROM (
  SELECT auction_id, COUNT(*) AS n
  FROM public.dkp_bids
  WHERE auction_id IS NOT NULL AND status IN ('active','lost','won')
  GROUP BY auction_id
) ladder
WHERE ladder.auction_id = a.id AND a.bid_count IS DISTINCT FROM ladder.n;

UPDATE public.dkp_auctions a
SET bid_count = 0
WHERE bid_count <> 0
  AND NOT EXISTS (SELECT 1 FROM public.dkp_bids b
                  WHERE b.auction_id = a.id AND b.status IN ('active','lost','won'));

-- ── 3+4. resolve_auction v3: ordered refund locks, self-describing event ────

CREATE OR REPLACE FUNCTION public.resolve_auction(p_auction_id UUID, p_winner_bid_id UUID DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_bid RECORD;
  v_auction RECORD;
  v_server_id UUID;
  v_item_name TEXT;
  v_item_id UUID;
  v_winner_member_id UUID;
  v_winner_name TEXT;
  v_winner_user_id UUID;
  v_winner_amount INTEGER;
  v_active_count INTEGER;
  v_refunded UUID[] := '{}';
  v_cancelled BOOLEAN := false;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.dkp_auctions WHERE id = p_auction_id AND status = 'active') THEN
    RETURN;
  END IF;

  SELECT a.server_id, a.item_id, a.bid_count, i.name AS item_name
  INTO v_auction
  FROM public.dkp_auctions a JOIN public.items i ON i.id = a.item_id
  WHERE a.id = p_auction_id FOR UPDATE OF a;
  v_server_id := v_auction.server_id;
  v_item_id   := v_auction.item_id;
  v_item_name := v_auction.item_name;

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

  -- A soft-close bid may have extended the deadline since the cron picked this
  -- auction up. Automated path only — staff ending early is deliberate.
  IF auth.role() = 'service_role'
     AND EXISTS (SELECT 1 FROM public.dkp_auctions WHERE id = p_auction_id AND bid_end_time > now()) THEN
    RETURN;
  END IF;

  -- Lock every balance row the refund loops below will touch, in ascending
  -- member_id — the same order place_bid uses, so the two cannot deadlock.
  PERFORM 1 FROM public.dkp_balances db
  WHERE db.server_id = v_server_id
    AND db.member_id IN (SELECT b.member_id FROM public.dkp_bids b
                         WHERE b.auction_id = p_auction_id AND b.status = 'active')
  ORDER BY db.member_id
  FOR UPDATE;

  IF p_winner_bid_id IS NULL THEN
    v_cancelled := true;
    FOR v_bid IN SELECT b.*, m.user_id FROM public.dkp_bids b JOIN public.members m ON m.id = b.member_id WHERE b.auction_id = p_auction_id AND b.status = 'active'
    LOOP
      INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
      VALUES (v_server_id, v_bid.member_id, v_bid.bid_amount, 'earn_refund', 'Auction cancelled', v_bid.id, 'bid');
      UPDATE public.dkp_bids SET status = 'cancelled', resolved_at = now() WHERE id = v_bid.id;
      v_refunded := array_append(v_refunded, v_bid.member_id);

      IF v_bid.user_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, server_id, type, title, body, metadata)
        VALUES (v_bid.user_id, v_server_id, 'dkp_lost',
          'Auction cancelled',
          'The auction for "' || COALESCE(v_item_name, 'Unknown item') || '" was cancelled. Your DKP has been refunded.',
          jsonb_build_object('auction_id', p_auction_id, 'item_name', v_item_name));
      END IF;
    END LOOP;
  ELSE
    SELECT b.bid_amount, b.member_id INTO v_winner_amount, v_winner_member_id
    FROM public.dkp_bids b
    WHERE b.id = p_winner_bid_id AND b.auction_id = p_auction_id AND b.status = 'active';

    IF NOT FOUND THEN
      -- Winner already processed by a concurrent call — cancel the remainder.
      v_cancelled := true;
      FOR v_bid IN SELECT b.*, m.user_id FROM public.dkp_bids b JOIN public.members m ON m.id = b.member_id WHERE b.auction_id = p_auction_id AND b.status = 'active'
      LOOP
        INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
        VALUES (v_server_id, v_bid.member_id, v_bid.bid_amount, 'earn_refund', 'Auction cancelled', v_bid.id, 'bid');
        UPDATE public.dkp_bids SET status = 'cancelled', resolved_at = now() WHERE id = v_bid.id;
        v_refunded := array_append(v_refunded, v_bid.member_id);

        IF v_bid.user_id IS NOT NULL THEN
          INSERT INTO public.notifications (user_id, server_id, type, title, body, metadata)
          VALUES (v_bid.user_id, v_server_id, 'dkp_lost',
            'Auction cancelled',
            'The auction for "' || COALESCE(v_item_name, 'Unknown item') || '" was cancelled. Your DKP has been refunded.',
            jsonb_build_object('auction_id', p_auction_id, 'item_name', v_item_name));
        END IF;
      END LOOP;
    ELSE
      UPDATE public.dkp_bids SET status = 'won', resolved_at = now()
      WHERE id = p_winner_bid_id AND auction_id = p_auction_id;

      SELECT m.user_id, m.name INTO v_winner_user_id, v_winner_name
      FROM public.members m WHERE m.id = v_winner_member_id;

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
        v_refunded := array_append(v_refunded, v_bid.member_id);

        IF v_bid.user_id IS NOT NULL THEN
          INSERT INTO public.notifications (user_id, server_id, type, title, body, metadata)
          VALUES (v_bid.user_id, v_server_id, 'dkp_lost',
            'Auction ended — you did not win',
            'You did not win "' || COALESCE(v_item_name, 'Unknown item') || '". Your DKP has been refunded.',
            jsonb_build_object('auction_id', p_auction_id, 'item_name', v_item_name));
        END IF;
      END LOOP;
    END IF;
  END IF;

  UPDATE public.dkp_auctions SET status = 'resolved' WHERE id = p_auction_id;

  SELECT COUNT(*) INTO v_active_count FROM public.dkp_auctions WHERE item_id = v_item_id AND status = 'active';
  IF v_active_count = 0 THEN
    UPDATE public.items SET is_up_for_bid = false, bid_end_time = NULL WHERE id = v_item_id;
  END IF;

  -- Self-describing terminal event: enough for clients to patch caches without
  -- refetching. kind stays 'auction_resolved' for old-bundle compatibility;
  -- new clients branch on `cancelled`.
  PERFORM public.dkp_broadcast(v_server_id, 'sync', jsonb_build_object(
    'kind', 'auction_resolved',
    'auctionId', p_auction_id,
    'cancelled', v_cancelled,
    'winnerId', v_winner_member_id,
    'winnerName', v_winner_name,
    'winningBid', v_winner_amount,
    'bidCount', v_auction.bid_count,
    'refundedMemberIds', to_jsonb(v_refunded),
    'ts', now()
  ));
END;
$$;

-- ── 4. cancel_bid v3: event carries the recomputed ladder state ─────────────

CREATE OR REPLACE FUNCTION public.cancel_bid(p_bid_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_bid RECORD;
  v_next RECORD;
  v_new_count INTEGER;
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

  -- Same lock order as everywhere: auction, then the member's balance row.
  IF v_bid.auction_id IS NOT NULL THEN
    PERFORM 1 FROM public.dkp_auctions WHERE id = v_bid.auction_id FOR UPDATE;
  END IF;
  PERFORM 1 FROM public.dkp_balances
  WHERE server_id = v_bid.server_id AND member_id = v_bid.member_id
  FOR UPDATE;

  INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
  VALUES (v_bid.server_id, v_bid.member_id, v_bid.bid_amount, 'earn_refund', 'Bid cancelled', p_bid_id, 'bid');

  UPDATE public.dkp_bids SET status = 'cancelled', resolved_at = now() WHERE id = p_bid_id;

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
    WHERE id = v_bid.auction_id
    RETURNING bid_count INTO v_new_count;

    PERFORM public.dkp_broadcast(v_bid.server_id, 'sync', jsonb_build_object(
      'kind', 'bid_cancelled',
      'auctionId', v_bid.auction_id,
      'highestBid', COALESCE(v_next.bid_amount, 0),
      'highestBidderId', v_next.member_id,
      'bidCount', v_new_count,
      'cancelledMemberId', v_bid.member_id,
      'ts', now()
    ));
  END IF;
END;
$$;

-- ── 5. RLS initplan: identical predicates, evaluated once per statement ─────

DROP POLICY IF EXISTS "Moderators can manage auctions" ON public.dkp_auctions;
CREATE POLICY "Moderators can manage auctions" ON public.dkp_auctions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.server_members sm
            WHERE sm.server_id = dkp_auctions.server_id
              AND sm.user_id = (SELECT auth.uid())
              AND sm.role IN ('owner','moderator'))
  );

DROP POLICY IF EXISTS "Members can read server auctions" ON public.dkp_auctions;
CREATE POLICY "Members can read server auctions" ON public.dkp_auctions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.server_members
            WHERE server_members.server_id = dkp_auctions.server_id
              AND server_members.user_id = (SELECT auth.uid()))
    OR EXISTS (SELECT 1 FROM public.servers
               WHERE servers.id = dkp_auctions.server_id AND servers.viewer_key IS NOT NULL)
  );

DROP POLICY IF EXISTS "Staff manage bids" ON public.dkp_bids;
CREATE POLICY "Staff manage bids" ON public.dkp_bids
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.server_members
            WHERE server_members.server_id = dkp_bids.server_id
              AND server_members.user_id = (SELECT auth.uid())
              AND server_members.role IN ('owner','moderator'))
  );

DROP POLICY IF EXISTS "Members read own bids" ON public.dkp_bids;
CREATE POLICY "Members read own bids" ON public.dkp_bids
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.members m
            WHERE m.id = dkp_bids.member_id AND m.user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Staff manage dkp transactions" ON public.dkp_transactions;
CREATE POLICY "Staff manage dkp transactions" ON public.dkp_transactions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.server_members
            WHERE server_members.server_id = dkp_transactions.server_id
              AND server_members.user_id = (SELECT auth.uid())
              AND server_members.role IN ('owner','moderator'))
  );

DROP POLICY IF EXISTS "Members read own dkp transactions" ON public.dkp_transactions;
CREATE POLICY "Members read own dkp transactions" ON public.dkp_transactions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.members m
            WHERE m.id = dkp_transactions.member_id AND m.user_id = (SELECT auth.uid()))
  );
