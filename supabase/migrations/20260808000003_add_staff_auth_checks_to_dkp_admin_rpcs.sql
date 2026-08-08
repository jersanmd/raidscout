-- Critical security fix: several DKP admin RPCs had zero server-side
-- authorization check despite being granted EXECUTE to anon/authenticated
-- (the public REST API). Unlike place_bid/cancel_bid/unmark_item_from_bid,
-- which correctly check auth.uid() + membership, these let ANY caller --
-- including unauthenticated (anon) -- invoke them directly via
-- POST /rest/v1/rpc/<name>, no staff role or even login required:
--
--   - mark_item_for_bid: create auctions for any item on any server
--   - adjust_member_dkp: mint/burn arbitrary DKP for any member
--   - resolve_auction: crown an arbitrary bid as the winner of any auction
--   - delete_auction_round: delete bid/transaction history for any item
--
-- Production evidence: mark_item_for_bid was hit in metronomic ~2-3s-apart
-- bursts (up to 25 calls in 82 seconds) sweeping across nearly every item
-- catalog-wide over several weeks -- consistent with an external script
-- calling the public endpoint directly, not app usage. This is very likely
-- what produced the "zombie auction" / scattered-bid data corruption
-- reported on SVEN 1.
--
-- Fix: add the same auth.uid() + server_members role check already used
-- by place_bid, requiring 'owner' or 'moderator' -- matching the isStaff
-- gate already enforced (client-side only, not a real boundary) in the
-- frontend for all of these actions. auto_resolve_auction is called only
-- by the bot's cron process using the service_role key (no frontend caller
-- exists), so it's restricted to service_role instead of a staff check.

-- ── mark_item_for_bid ──
-- Drop older overloads entirely -- they predate p_server_id/guild/quantity
-- support, nothing in the app calls them, and leaving them in place would
-- keep an unguarded, unauthenticated path to the same vulnerability alive.
DROP FUNCTION IF EXISTS public.mark_item_for_bid(uuid, integer, timestamptz, integer);
DROP FUNCTION IF EXISTS public.mark_item_for_bid(uuid, integer, timestamptz, integer, uuid);
DROP FUNCTION IF EXISTS public.mark_item_for_bid(uuid, integer, timestamptz, integer, uuid, integer, uuid);

CREATE OR REPLACE FUNCTION public.mark_item_for_bid(
  p_item_id UUID,
  p_dkp_cost INTEGER,
  p_bid_end_time TIMESTAMPTZ DEFAULT NULL,
  p_duration_minutes INTEGER DEFAULT 30,
  p_guild_id UUID DEFAULT NULL,
  p_quantity INTEGER DEFAULT 1,
  p_server_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_server_id UUID;
  v_auction_id UUID;
BEGIN
  SELECT server_id INTO v_server_id FROM public.items WHERE id = p_item_id;

  -- Fallback to passed server_id for game-level items (server_id IS NULL)
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

  IF EXISTS (
    SELECT 1 FROM public.dkp_auctions
    WHERE item_id = p_item_id AND status = 'active'
      AND guild_id IS NOT DISTINCT FROM p_guild_id
  ) THEN
    RAISE EXCEPTION 'This item already has an active auction. Wait for it to resolve, or cancel it first.';
  END IF;

  INSERT INTO public.dkp_auctions (item_id, server_id, dkp_cost, bid_end_time, guild_id, quantity)
  VALUES (p_item_id, v_server_id, p_dkp_cost,
          COALESCE(p_bid_end_time, now() + (p_duration_minutes || ' minutes')::INTERVAL),
          p_guild_id, GREATEST(p_quantity, 1))
  RETURNING id INTO v_auction_id;

  UPDATE public.items SET is_up_for_bid = true WHERE id = p_item_id;
  DELETE FROM public.dkp_distributed WHERE item_id = p_item_id;

  RETURN v_auction_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.mark_item_for_bid(UUID, INTEGER, TIMESTAMPTZ, INTEGER, UUID, INTEGER, UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_item_for_bid(UUID, INTEGER, TIMESTAMPTZ, INTEGER, UUID, INTEGER, UUID) FROM anon;

-- ── adjust_member_dkp ──
CREATE OR REPLACE FUNCTION public.adjust_member_dkp(p_member_id UUID, p_server_id UUID, p_amount INTEGER, p_reason TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_txn_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.server_members
    WHERE user_id = auth.uid() AND server_id = p_server_id AND role IN ('owner', 'moderator')
  ) THEN
    RAISE EXCEPTION 'Staff access required';
  END IF;

  INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_type)
  VALUES (p_server_id, p_member_id, p_amount, 'earn_adjustment', p_reason, 'manual') RETURNING id INTO v_txn_id;
  RETURN v_txn_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.adjust_member_dkp(UUID, UUID, INTEGER, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.adjust_member_dkp(UUID, UUID, INTEGER, TEXT) FROM anon;

-- ── resolve_auction ──
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
  -- Guard: only resolve active auctions (prevents duplicate resolution)
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

  -- Re-check after lock in case of race
  IF NOT EXISTS (SELECT 1 FROM public.dkp_auctions WHERE id = p_auction_id AND status = 'active') THEN
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
    -- Validate winner bid belongs to this auction AND is still active
    SELECT bid_amount INTO v_winner_amount FROM public.dkp_bids
    WHERE id = p_winner_bid_id AND auction_id = p_auction_id AND status = 'active';

    IF NOT FOUND THEN
      -- Winner bid already processed by a concurrent call — fall through to cancel any remaining active bids
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

  -- If no more active auctions for this item, clear is_up_for_bid
  SELECT COUNT(*) INTO v_active_count FROM public.dkp_auctions WHERE item_id = v_item_id AND status = 'active';
  IF v_active_count = 0 THEN
    UPDATE public.items SET is_up_for_bid = false, bid_end_time = NULL WHERE id = v_item_id;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.resolve_auction(UUID, UUID) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.resolve_auction(UUID, UUID) FROM anon;

-- ── auto_resolve_auction ── no frontend caller exists; only scripts/bot/spawn-cron.ts
-- calls it, using SUPABASE_SERVICE_ROLE_KEY. Restrict to service_role entirely.
REVOKE EXECUTE ON FUNCTION public.auto_resolve_auction(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_resolve_auction(UUID) TO service_role;

-- ── delete_auction_round ──
CREATE OR REPLACE FUNCTION public.delete_auction_round(p_item_id UUID, p_auction_round INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_bid_ids UUID[];
  v_auction_ids UUID[];
  v_server_id UUID;
BEGIN
  SELECT server_id INTO v_server_id FROM public.items WHERE id = p_item_id;

  IF v_server_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.server_members
    WHERE user_id = auth.uid() AND server_id = v_server_id AND role IN ('owner', 'moderator')
  ) THEN
    RAISE EXCEPTION 'Staff access required';
  END IF;

  -- Get all bid IDs for this round
  SELECT array_agg(id) INTO v_bid_ids FROM public.dkp_bids
  WHERE item_id = p_item_id AND auction_round = p_auction_round;

  -- Collect auction IDs before deleting bids
  SELECT array_agg(DISTINCT auction_id) INTO v_auction_ids
  FROM public.dkp_bids
  WHERE item_id = p_item_id AND auction_round = p_auction_round
    AND auction_id IS NOT NULL;

  -- Delete transactions referencing these bids
  IF v_bid_ids IS NOT NULL THEN
    DELETE FROM public.dkp_transactions
    WHERE reference_id = ANY(v_bid_ids) AND reference_type = 'bid';
  END IF;

  -- Delete the bids
  DELETE FROM public.dkp_bids
  WHERE item_id = p_item_id AND auction_round = p_auction_round;

  -- Delete auctions referenced by bids (if any)
  IF v_auction_ids IS NOT NULL THEN
    DELETE FROM public.dkp_auctions WHERE id = ANY(v_auction_ids);
  END IF;

  -- Delete orphaned auctions with no bids for this item (resolved/cancelled only)
  DELETE FROM public.dkp_auctions
  WHERE item_id = p_item_id
    AND status IN ('resolved', 'cancelled')
    AND id NOT IN (SELECT DISTINCT auction_id FROM public.dkp_bids WHERE auction_id IS NOT NULL);

  -- Cleanup distributed status
  DELETE FROM public.dkp_distributed
  WHERE item_id = p_item_id AND auction_round = p_auction_round;
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_auction_round(UUID, INTEGER) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_auction_round(UUID, INTEGER) FROM anon;
