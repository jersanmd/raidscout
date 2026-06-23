-- 141: Fix quantity — each auction row has its own quantity, mark creates 1 row regardless of qty
ALTER TABLE public.dkp_auctions ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;

-- Fix mark_item_for_bid: always create 1 row, store quantity on the row
DROP FUNCTION IF EXISTS public.mark_item_for_bid(uuid, integer, timestamptz, integer, uuid, integer);
CREATE OR REPLACE FUNCTION public.mark_item_for_bid(
  p_item_id UUID,
  p_dkp_cost INTEGER,
  p_bid_end_time TIMESTAMPTZ DEFAULT NULL,
  p_duration_minutes INTEGER DEFAULT 30,
  p_guild_id UUID DEFAULT NULL,
  p_quantity INTEGER DEFAULT 1
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
