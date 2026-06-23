-- 142: Fix auto_resolve_auction — only resolve auctions whose bid_end_time has passed
-- Previously it resolved ALL active auctions for an item, prematurely killing staggered auctions.
DROP FUNCTION IF EXISTS public.auto_resolve_auction(uuid);
CREATE OR REPLACE FUNCTION public.auto_resolve_auction(p_item_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auction RECORD;
BEGIN
  FOR v_auction IN SELECT id FROM public.dkp_auctions
    WHERE item_id = p_item_id AND status = 'active' AND bid_end_time <= now()
  LOOP
    PERFORM public.resolve_auction(v_auction.id, NULL);
  END LOOP;
END;
$$;
