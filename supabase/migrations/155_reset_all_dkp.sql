-- 155: Reset all DKP points to 0 for a server (staff only)
CREATE OR REPLACE FUNCTION public.reset_all_dkp(p_server_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only owner/moderator can reset
  IF NOT EXISTS (
    SELECT 1 FROM public.server_members sm
    WHERE sm.server_id = p_server_id AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'moderator')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Delete all DKP transactions for this server
  DELETE FROM public.dkp_transactions WHERE server_id = p_server_id;

  -- Delete all bids for this server
  DELETE FROM public.dkp_bids WHERE server_id = p_server_id;

  -- Reset all active auctions to cancelled
  UPDATE public.dkp_auctions SET status = 'cancelled' WHERE server_id = p_server_id AND status = 'active';

  -- Clear is_up_for_bid on all items
  UPDATE public.items SET is_up_for_bid = false, bid_end_time = NULL, dkp_cost = NULL
  WHERE server_id = p_server_id AND is_up_for_bid = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_all_dkp(UUID) TO authenticated;
