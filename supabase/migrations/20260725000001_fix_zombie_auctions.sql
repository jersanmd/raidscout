-- 20260725: Fix zombie auctions — resolved auctions where bids exist but no winner was recorded
-- Caused by race condition (before migration 190) where concurrent auto_resolve_auction calls
-- could roll back bid status changes while leaving auctions in 'resolved' state.

-- Strategy: Find the highest bid (by amount) for each affected auction and mark it as 'won'.
-- Other bids for that auction remain as-is (they're already 'lost' or 'cancelled').

DO $$
DECLARE
  v_auction RECORD;
  v_winner RECORD;
BEGIN
  FOR v_auction IN
    SELECT a.id, a.item_id, a.server_id, a.dkp_cost,
           i.name AS item_name
    FROM public.dkp_auctions a
    JOIN public.items i ON i.id = a.item_id
    WHERE a.status = 'resolved'
      AND NOT EXISTS (SELECT 1 FROM public.dkp_bids b WHERE b.auction_id = a.id AND b.status = 'won')
      AND EXISTS (SELECT 1 FROM public.dkp_bids b WHERE b.auction_id = a.id)
    ORDER BY a.created_at DESC
  LOOP
    -- Find the highest bid (any status — pick the max amount)
    SELECT b.id, b.member_id, b.bid_amount, m.name AS member_name, m.user_id
    INTO v_winner
    FROM public.dkp_bids b
    JOIN public.members m ON m.id = b.member_id
    WHERE b.auction_id = v_auction.id
    ORDER BY b.bid_amount DESC, b.created_at ASC
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE NOTICE 'Auction %: no bids found, skipping', v_auction.id;
      CONTINUE;
    END IF;

    -- Mark as won
    UPDATE public.dkp_bids SET status = 'won', resolved_at = now()
    WHERE id = v_winner.id;

    RAISE NOTICE 'Auction % (%): winner = % (% DKP)',
      v_auction.id, v_auction.item_name, v_winner.member_name, v_winner.bid_amount;
  END LOOP;
END;
$$;

