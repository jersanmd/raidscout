-- 139: Allow marking same item multiple times — increments quantity instead of replacing
CREATE OR REPLACE FUNCTION public.mark_item_for_bid(
  p_item_id UUID,
  p_dkp_cost INTEGER,
  p_bid_end_time TIMESTAMPTZ DEFAULT NULL,
  p_duration_minutes INTEGER DEFAULT 30,
  p_guild_id UUID DEFAULT NULL,
  p_quantity INTEGER DEFAULT 1
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing RECORD;
BEGIN
  -- Check if item is already up for bid
  SELECT is_up_for_bid, dkp_quantity INTO v_existing FROM public.items WHERE id = p_item_id;

  IF v_existing.is_up_for_bid THEN
    -- Already up for bid: add to existing quantity
    UPDATE public.items 
    SET dkp_cost = p_dkp_cost,
        bid_end_time = COALESCE(p_bid_end_time, now() + (p_duration_minutes || ' minutes')::INTERVAL),
        dkp_guild_id = p_guild_id,
        dkp_quantity = v_existing.dkp_quantity + GREATEST(p_quantity, 1)
    WHERE id = p_item_id;
  ELSE
    -- New auction
    UPDATE public.items 
    SET is_up_for_bid = true, 
        dkp_cost = p_dkp_cost, 
        bid_end_time = COALESCE(p_bid_end_time, now() + (p_duration_minutes || ' minutes')::INTERVAL),
        auction_round = auction_round + 1,
        dkp_guild_id = p_guild_id,
        dkp_quantity = GREATEST(p_quantity, 1)
    WHERE id = p_item_id;

    -- Clear distributed status for new round
    DELETE FROM public.dkp_distributed WHERE item_id = p_item_id;
  END IF;
END;
$$;
