-- Fix: the green "Distributed" indicator disappeared some time after staff clicked
-- Distribute.
--
-- mark_item_for_bid ended with:
--     DELETE FROM public.dkp_distributed WHERE item_id = p_item_id;
--
-- That is item-wide, so listing an item for bid again wiped the distributed marker
-- of every PREVIOUS, already-completed auction for that item -- not just the new
-- one. On an active guild the same item is auctioned repeatedly (one item here has
-- 28 auctions), so markers vanished constantly, and the "while" before disappearing
-- was simply however long until that item next went up for bid.
--
-- Production evidence: 526 distribute actions recorded in the audit log, but only
-- 37 dkp_distributed rows remained for that server. 457 of the 526 had their item
-- re-marked for bid after being distributed.
--
-- The DELETE is also unnecessary. dkp_distributed rows are keyed by auction_id
-- (zero NULLs on production), and a newly created auction gets a brand-new
-- auction_id, so it cannot inherit a stale marker. The statement is a leftover from
-- before dkp_distributed tracked auction_id, and only ever destroyed history.
--
-- Everything else about the function is unchanged from 20260808000005, including
-- the staff authorization check.

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

  IF NOT EXISTS (
    SELECT 1 FROM public.server_members
    WHERE user_id = auth.uid() AND server_id = v_server_id AND role IN ('owner', 'moderator')
  ) THEN
    RAISE EXCEPTION 'Staff access required';
  END IF;

  INSERT INTO public.dkp_auctions (item_id, server_id, dkp_cost, bid_end_time, guild_id, quantity)
  VALUES (p_item_id, v_server_id, p_dkp_cost,
          COALESCE(p_bid_end_time, now() + (p_duration_minutes || ' minutes')::INTERVAL),
          p_guild_id, GREATEST(p_quantity, 1))
  RETURNING id INTO v_auction_id;

  UPDATE public.items SET is_up_for_bid = true WHERE id = p_item_id;

  -- (No dkp_distributed cleanup here -- see header.)

  RETURN v_auction_id;
END;
$$;
