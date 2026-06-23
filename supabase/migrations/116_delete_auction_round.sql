-- 116: delete_auction_round - allow staff to delete an auction cycle for development
CREATE OR REPLACE FUNCTION public.delete_auction_round(
  p_item_id UUID,
  p_auction_round INTEGER
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_bid_ids UUID[];
BEGIN
  -- Collect bid IDs for this round
  SELECT array_agg(id) INTO v_bid_ids
  FROM public.dkp_bids
  WHERE item_id = p_item_id AND auction_round = p_auction_round;

  -- Delete associated transactions
  IF v_bid_ids IS NOT NULL THEN
    DELETE FROM public.dkp_transactions
    WHERE reference_type = 'bid' AND reference_id = ANY(v_bid_ids);
  END IF;

  -- Delete the bids
  DELETE FROM public.dkp_bids
  WHERE item_id = p_item_id AND auction_round = p_auction_round;
END;
$$;
