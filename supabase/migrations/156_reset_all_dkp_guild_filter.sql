-- 156: Add guild filter parameter to reset_all_dkp
CREATE OR REPLACE FUNCTION public.reset_all_dkp(p_server_id UUID, p_guild_names TEXT[] DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_guild_ids UUID[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.server_members sm
    WHERE sm.server_id = p_server_id AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'moderator')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_guild_names IS NOT NULL AND array_length(p_guild_names, 1) > 0 THEN
    SELECT array_agg(id) INTO v_guild_ids
    FROM public.guilds
    WHERE server_id = p_server_id AND name = ANY(p_guild_names);

    IF v_guild_ids IS NULL OR array_length(v_guild_ids, 1) = 0 THEN
      RAISE EXCEPTION 'No matching guilds found';
    END IF;
  END IF;

  IF v_guild_ids IS NOT NULL THEN
    DELETE FROM public.dkp_transactions
    WHERE server_id = p_server_id
      AND member_id IN (SELECT id FROM public.members WHERE server_id = p_server_id AND guild_id = ANY(v_guild_ids));
  ELSE
    DELETE FROM public.dkp_transactions WHERE server_id = p_server_id;
  END IF;

  IF v_guild_ids IS NOT NULL THEN
    DELETE FROM public.dkp_bids
    WHERE server_id = p_server_id
      AND member_id IN (SELECT id FROM public.members WHERE server_id = p_server_id AND guild_id = ANY(v_guild_ids));
  ELSE
    DELETE FROM public.dkp_bids WHERE server_id = p_server_id;
  END IF;

  IF v_guild_ids IS NOT NULL THEN
    UPDATE public.dkp_auctions SET status = 'cancelled'
    WHERE server_id = p_server_id AND status = 'active'
      AND (guild_id IS NULL OR guild_id = ANY(v_guild_ids));
  ELSE
    UPDATE public.dkp_auctions SET status = 'cancelled' WHERE server_id = p_server_id AND status = 'active';
  END IF;

  IF v_guild_ids IS NOT NULL THEN
    UPDATE public.items SET is_up_for_bid = false, bid_end_time = NULL, dkp_cost = NULL
    WHERE server_id = p_server_id AND is_up_for_bid = true
      AND (guild_id IS NULL OR guild_id = ANY(v_guild_ids));
  ELSE
    UPDATE public.items SET is_up_for_bid = false, bid_end_time = NULL, dkp_cost = NULL
    WHERE server_id = p_server_id AND is_up_for_bid = true;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_all_dkp(UUID, TEXT[]) TO authenticated;
