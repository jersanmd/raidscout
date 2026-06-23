-- 136: Add quantity field to items for DKP auctions
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS dkp_quantity INTEGER DEFAULT 1;

-- Update mark_item_for_bid to accept quantity
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
BEGIN
  UPDATE public.items 
  SET is_up_for_bid = true, 
      dkp_cost = p_dkp_cost, 
      bid_end_time = COALESCE(p_bid_end_time, now() + (p_duration_minutes || ' minutes')::INTERVAL),
      auction_round = auction_round + 1,
      dkp_guild_id = p_guild_id,
      dkp_quantity = GREATEST(p_quantity, 1)
  WHERE id = p_item_id;

  -- Clear distributed status for this item's new round
  DELETE FROM public.dkp_distributed WHERE item_id = p_item_id;
END;
$$;
