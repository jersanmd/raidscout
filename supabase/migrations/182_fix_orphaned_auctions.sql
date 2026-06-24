-- 182: Fix delete_auction_round — also delete orphaned auctions with no bids
-- When an auction has zero bids, v_auction_ids is NULL and the auction row survives.
-- Also disables RLS on dkp_distributed (enabled with no policies, blocks queries).
CREATE OR REPLACE FUNCTION public.delete_auction_round(p_item_id UUID, p_auction_round INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_bid_ids UUID[];
  v_auction_ids UUID[];
BEGIN
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

-- Also fix dkp_distributed: RLS was enabled on production with no policies
ALTER TABLE public.dkp_distributed DISABLE ROW LEVEL SECURITY;
