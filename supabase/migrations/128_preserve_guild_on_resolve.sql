-- 128: Don't clear dkp_guild_id on resolve + fix mark_item_for_bid to include both guild and distributed reset
CREATE OR REPLACE FUNCTION public.mark_item_for_bid(
  p_item_id UUID,
  p_dkp_cost INTEGER,
  p_bid_end_time TIMESTAMPTZ DEFAULT NULL,
  p_duration_minutes INTEGER DEFAULT 30,
  p_guild_id UUID DEFAULT NULL
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
      dkp_distributed = false
  WHERE id = p_item_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_resolve_auction(p_item_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_winner_bid_id UUID;
  v_winner_member_id UUID;
  v_winner_user_id UUID;
  v_winner_amount INTEGER;
  v_item_name TEXT;
  v_server_id UUID;
  v_bid RECORD;
BEGIN
  SELECT name, server_id INTO v_item_name, v_server_id FROM public.items WHERE id = p_item_id;

  SELECT id, member_id, bid_amount INTO v_winner_bid_id, v_winner_member_id, v_winner_amount
  FROM public.dkp_bids
  WHERE item_id = p_item_id AND status = 'active'
  ORDER BY bid_amount DESC, created_at ASC
  LIMIT 1;

  IF v_winner_bid_id IS NOT NULL THEN
    UPDATE public.dkp_bids SET status = 'won', resolved_at = now() WHERE id = v_winner_bid_id;

    SELECT m.user_id INTO v_winner_user_id FROM public.members m WHERE m.id = v_winner_member_id;
    IF v_winner_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, server_id, type, title, body, metadata)
      VALUES (v_winner_user_id, v_server_id, 'dkp_won',
        'You won the auction!',
        'You won "' || COALESCE(v_item_name, 'Unknown item') || '" for ' || v_winner_amount || ' DKP.',
        jsonb_build_object('item_id', p_item_id, 'item_name', v_item_name, 'winning_bid', v_winner_amount));
    END IF;
  END IF;

  FOR v_bid IN
    SELECT b.id, b.member_id, b.bid_amount, m.user_id
    FROM public.dkp_bids b
    JOIN public.members m ON m.id = b.member_id
    WHERE b.item_id = p_item_id AND b.status = 'active' AND b.id != v_winner_bid_id
  LOOP
    IF v_bid.user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, server_id, type, title, body, metadata)
      VALUES (v_bid.user_id, v_server_id, 'dkp_lost',
        'Auction ended — you did not win',
        'You did not win "' || COALESCE(v_item_name, 'Unknown item') || '". Your DKP has been refunded.',
        jsonb_build_object('item_id', p_item_id, 'item_name', v_item_name));
    END IF;
  END LOOP;

  UPDATE public.dkp_bids SET status = 'cancelled', resolved_at = now()
  WHERE item_id = p_item_id AND status = 'active';

  -- Keep dkp_guild_id for history display; mark_item_for_bid will overwrite it on re-mark
  UPDATE public.items SET is_up_for_bid = false, bid_end_time = NULL WHERE id = p_item_id;
END;
$$;
