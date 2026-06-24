-- 179: Fix delete_auction_round to also clean up dkp_auctions rows
-- Previously only deleted bids, transactions, and distributed records,
-- but left the auction row in dkp_auctions — so it kept appearing in history.
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

  -- Delete the auction rows themselves
  IF v_auction_ids IS NOT NULL THEN
    DELETE FROM public.dkp_auctions WHERE id = ANY(v_auction_ids);
  END IF;

  -- Cleanup distributed status
  DELETE FROM public.dkp_distributed
  WHERE item_id = p_item_id AND auction_round = p_auction_round;
END;
$$;
