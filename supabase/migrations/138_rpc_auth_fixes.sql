-- 138: Fix HIGH audit issues — add auth checks to RPCs without breaking functionality

-- H1: get_pending_claims — restrict to staff only
DROP FUNCTION IF EXISTS public.get_pending_claims(uuid);
CREATE OR REPLACE FUNCTION public.get_pending_claims(p_server_id UUID)
RETURNS TABLE(
  id UUID,
  user_id UUID,
  user_email TEXT,
  requested_name TEXT,
  status TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 
    cr.id, cr.user_id, u.email AS user_email, 
    cr.requested_name, cr.status, cr.created_at
  FROM public.member_claim_requests cr
  JOIN auth.users u ON u.id = cr.user_id
  WHERE cr.server_id = p_server_id AND cr.status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.server_members sm
      WHERE sm.server_id = p_server_id AND sm.user_id = auth.uid()
        AND sm.role IN ('owner', 'moderator')
    )
  ORDER BY cr.created_at ASC;
$$;

-- H2: submit_claim_request — prevent duplicate pending claims for same server
DROP FUNCTION IF EXISTS public.submit_claim_request(uuid, text);
CREATE OR REPLACE FUNCTION public.submit_claim_request(
  p_server_id UUID,
  p_requested_name TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
  v_member_exists BOOLEAN;
BEGIN
  -- Check if the requested name exists in the server
  SELECT EXISTS(
    SELECT 1 FROM public.members
    WHERE server_id = p_server_id
      AND LOWER(TRIM(name)) = LOWER(TRIM(p_requested_name))
  ) INTO v_member_exists;

  IF NOT v_member_exists THEN
    RAISE EXCEPTION 'Member "%" not found in this server. Make sure the name matches exactly.', trim(p_requested_name);
  END IF;

  -- H2 FIX: Prevent duplicate pending claims for same server
  IF EXISTS (
    SELECT 1 FROM public.member_claim_requests
    WHERE server_id = p_server_id AND user_id = auth.uid() AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'You already have a pending claim for this server.';
  END IF;

  INSERT INTO public.member_claim_requests (server_id, user_id, requested_name)
  VALUES (p_server_id, auth.uid(), trim(p_requested_name))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- H5: cancel_bid — ensure only the bid owner can cancel
DROP FUNCTION IF EXISTS public.cancel_bid(uuid);
CREATE OR REPLACE FUNCTION public.cancel_bid(p_bid_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_bid RECORD;
  v_server_id UUID;
BEGIN
  SELECT b.id, b.member_id, b.bid_amount, b.status, m.server_id
  INTO v_bid
  FROM public.dkp_bids b
  JOIN public.members m ON m.id = b.member_id
  WHERE b.id = p_bid_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Bid not found'; END IF;
  IF v_bid.status != 'active' THEN RAISE EXCEPTION 'Bid is not active'; END IF;

  -- H5 FIX: Only the bid owner (or staff) can cancel
  IF NOT EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = v_bid.member_id AND m.user_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM public.server_members sm
    WHERE sm.server_id = v_bid.server_id AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'moderator')
  ) THEN
    RAISE EXCEPTION 'You can only cancel your own bids';
  END IF;

  INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
  VALUES (v_bid.server_id, v_bid.member_id, v_bid.bid_amount, 'earn_refund', 'Bid cancelled', p_bid_id, 'bid');

  UPDATE public.dkp_bids SET status = 'cancelled', resolved_at = now() WHERE id = p_bid_id;
END;
$$;

-- H6: unmark_item_from_bid — restrict to staff only
DROP FUNCTION IF EXISTS public.unmark_item_from_bid(uuid);
CREATE OR REPLACE FUNCTION public.unmark_item_from_bid(p_item_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_bid RECORD;
  v_server_id UUID;
BEGIN
  SELECT server_id INTO v_server_id FROM public.items WHERE id = p_item_id;

  -- H6 FIX: Staff-only check
  IF NOT EXISTS (
    SELECT 1 FROM public.server_members sm
    WHERE sm.server_id = v_server_id AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'moderator')
  ) THEN
    RAISE EXCEPTION 'Only server staff can unmark items from bid';
  END IF;

  FOR v_bid IN
    SELECT id, member_id, bid_amount FROM public.dkp_bids
    WHERE item_id = p_item_id AND status = 'active'
  LOOP
    INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
    VALUES (v_server_id, v_bid.member_id, v_bid.bid_amount, 'earn_refund', 'Auction cancelled', v_bid.id, 'bid');
    UPDATE public.dkp_bids SET status = 'cancelled', resolved_at = now() WHERE id = v_bid.id;
  END LOOP;

  UPDATE public.items SET is_up_for_bid = false, dkp_cost = NULL, bid_end_time = NULL WHERE id = p_item_id;
END;
$$;

-- H7: get_item_bids — require server membership (not staff, preserves current UX)
DROP FUNCTION IF EXISTS public.get_item_bids(uuid);
CREATE OR REPLACE FUNCTION public.get_item_bids(p_item_id UUID)
RETURNS TABLE(
  id UUID,
  member_name TEXT,
  bid_amount INTEGER,
  status TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_server_id UUID;
BEGIN
  SELECT server_id INTO v_server_id FROM public.items WHERE id = p_item_id;

  -- H7 FIX: Must be a member of the item's server
  IF NOT EXISTS (
    SELECT 1 FROM public.server_members sm
    WHERE sm.server_id = v_server_id AND sm.user_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT 
    b.id, m.name AS member_name, b.bid_amount, b.status, b.created_at
  FROM public.dkp_bids b
  JOIN public.members m ON m.id = b.member_id
  WHERE b.item_id = p_item_id
  ORDER BY b.bid_amount DESC;
END;
$$;

-- H8: get_resolved_bids — require server membership
DROP FUNCTION IF EXISTS public.get_resolved_bids(uuid);
CREATE OR REPLACE FUNCTION public.get_resolved_bids(p_server_id UUID)
RETURNS TABLE(
  id UUID,
  item_id UUID,
  member_id UUID,
  member_name TEXT,
  bid_amount INTEGER,
  status TEXT,
  created_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  auction_round INTEGER,
  item_guild_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- H8 FIX: Must be a member of this server
  IF NOT EXISTS (
    SELECT 1 FROM public.server_members sm
    WHERE sm.server_id = p_server_id AND sm.user_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    b.id, b.item_id, b.member_id, m.name AS member_name,
    b.bid_amount, b.status, b.created_at, b.resolved_at,
    COALESCE(b.auction_round, 1) AS auction_round,
    ig.name AS item_guild_name
  FROM public.dkp_bids b
  JOIN public.members m ON m.id = b.member_id
  LEFT JOIN public.items i ON i.id = b.item_id
  LEFT JOIN public.guilds ig ON ig.id = i.dkp_guild_id
  WHERE b.server_id = p_server_id AND b.status IN ('won', 'lost', 'cancelled')
  ORDER BY b.resolved_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_resolved_bids(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_item_bids(UUID) TO authenticated;
