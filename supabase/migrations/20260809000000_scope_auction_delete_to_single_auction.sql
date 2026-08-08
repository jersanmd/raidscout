-- Fix: deleting one past auction wiped bids from every auction that item ever had.
--
-- place_bid hardcodes auction_round = 1 on every bid it inserts, so ALL 7,424 bids
-- on production share auction_round = 1. delete_auction_round deleted by
-- (item_id, auction_round), which therefore matched every bid for that item across
-- every auction it was ever listed in -- "Violent Storm Belt" alone has 28 auctions
-- sharing round 1.
--
-- Consequence: staff deleting a single past auction silently destroyed the bid
-- history (including the winning bids) of unrelated auctions for the same item.
-- The audit log records 8,806 bids placed on that server but only 7,424 remain --
-- 1,382 deleted. Those missing winning bids are why 43 resolved auctions have bids
-- that were all "Outbid" by a bid that no longer exists, leaving no winner.
--
-- Replaced with delete_auction(p_auction_id), which touches only the one auction.
-- Also adds the staff authorization check that delete_auction_round lacked until
-- 20260808000003, and which this function needs for the same reason.

DROP FUNCTION IF EXISTS public.delete_auction_round(uuid, integer);

CREATE OR REPLACE FUNCTION public.delete_auction(p_auction_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_server_id UUID;
  v_item_id UUID;
  v_bid_ids UUID[];
  v_active_count INTEGER;
BEGIN
  SELECT server_id, item_id INTO v_server_id, v_item_id
  FROM public.dkp_auctions WHERE id = p_auction_id;

  IF NOT FOUND THEN RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.server_members
    WHERE user_id = auth.uid() AND server_id = v_server_id AND role IN ('owner', 'moderator')
  ) THEN
    RAISE EXCEPTION 'Staff access required';
  END IF;

  -- Scope every delete to this auction only.
  SELECT array_agg(id) INTO v_bid_ids FROM public.dkp_bids WHERE auction_id = p_auction_id;

  IF v_bid_ids IS NOT NULL THEN
    DELETE FROM public.dkp_transactions
    WHERE reference_type = 'bid' AND reference_id = ANY(v_bid_ids);
  END IF;

  DELETE FROM public.dkp_bids WHERE auction_id = p_auction_id;
  DELETE FROM public.dkp_distributed WHERE auction_id = p_auction_id;
  DELETE FROM public.dkp_auctions WHERE id = p_auction_id;

  -- Clear the item's bid flag only if it has no other active auctions.
  SELECT count(*) INTO v_active_count
  FROM public.dkp_auctions WHERE item_id = v_item_id AND status = 'active';

  IF v_active_count = 0 THEN
    UPDATE public.items SET is_up_for_bid = false, bid_end_time = NULL WHERE id = v_item_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_auction(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_auction(UUID) FROM PUBLIC;
