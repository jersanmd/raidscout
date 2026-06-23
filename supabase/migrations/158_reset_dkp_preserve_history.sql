-- 158: Rewrite reset_all_dkp to preserve history — insert adjustments to zero out balances
CREATE OR REPLACE FUNCTION public.reset_all_dkp(p_server_id UUID, p_guild_names TEXT[] DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_guild_ids UUID[];
  v_member RECORD;
  v_balance INTEGER;
BEGIN
  -- Only owner/moderator can reset
  IF NOT EXISTS (
    SELECT 1 FROM public.server_members sm
    WHERE sm.server_id = p_server_id AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'moderator')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Resolve guild names to IDs if provided
  IF p_guild_names IS NOT NULL AND array_length(p_guild_names, 1) > 0 THEN
    SELECT array_agg(id) INTO v_guild_ids
    FROM public.guilds
    WHERE server_id = p_server_id AND name = ANY(p_guild_names);

    IF v_guild_ids IS NULL OR array_length(v_guild_ids, 1) = 0 THEN
      RAISE EXCEPTION 'No matching guilds found';
    END IF;
  END IF;

  -- For each member in target guilds, insert an adjustment to zero out their balance
  FOR v_member IN
    SELECT m.id, m.name
    FROM public.members m
    WHERE m.server_id = p_server_id
      AND (v_guild_ids IS NULL OR m.guild_id = ANY(v_guild_ids))
  LOOP
    -- Calculate current balance
    SELECT COALESCE(SUM(amount), 0) INTO v_balance
    FROM public.dkp_transactions
    WHERE member_id = v_member.id AND server_id = p_server_id;

    -- If non-zero, insert an adjustment to bring to 0
    IF v_balance <> 0 THEN
      INSERT INTO public.dkp_transactions (member_id, server_id, amount, type, reason)
      VALUES (v_member.id, p_server_id, -v_balance, 'adjustment', 'DKP reset');
    END IF;
  END LOOP;

  -- Cancel active auctions for target guilds (or all)
  IF v_guild_ids IS NOT NULL THEN
    UPDATE public.dkp_auctions SET status = 'cancelled'
    WHERE server_id = p_server_id AND status = 'active'
      AND (guild_id IS NULL OR guild_id = ANY(v_guild_ids));
  ELSE
    UPDATE public.dkp_auctions SET status = 'cancelled' WHERE server_id = p_server_id AND status = 'active';
  END IF;

  -- Clear is_up_for_bid on items for target guilds (or all)
  IF v_guild_ids IS NOT NULL THEN
    UPDATE public.items SET is_up_for_bid = false, bid_end_time = NULL, dkp_cost = NULL
    WHERE server_id = p_server_id AND is_up_for_bid = true
      AND (dkp_guild_id IS NULL OR dkp_guild_id = ANY(v_guild_ids));
  ELSE
    UPDATE public.items SET is_up_for_bid = false, bid_end_time = NULL, dkp_cost = NULL
    WHERE server_id = p_server_id AND is_up_for_bid = true;
  END IF;
END;
$$;
