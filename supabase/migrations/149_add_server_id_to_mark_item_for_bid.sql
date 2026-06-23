-- 149: Add p_server_id to mark_item_for_bid — fallback for game-level items with NULL server_id
DROP FUNCTION IF EXISTS public.mark_item_for_bid(uuid, integer, timestamptz, integer, uuid, integer);
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
