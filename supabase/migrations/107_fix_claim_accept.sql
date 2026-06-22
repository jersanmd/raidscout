-- 107: Fix review_claim_request to handle already-linked members
CREATE OR REPLACE FUNCTION public.review_claim_request(
  p_request_id UUID,
  p_action TEXT,
  p_reason TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_server_id UUID;
  v_user_id UUID;
  v_requested_name TEXT;
  v_member_id UUID;
  v_existing_user_id UUID;
BEGIN
  SELECT server_id, user_id, requested_name 
  INTO v_server_id, v_user_id, v_requested_name
  FROM public.member_claim_requests WHERE id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim request not found';
  END IF;

  IF p_action = 'accept' THEN
    -- Find the member by name (case-insensitive, trimmed)
    SELECT id, user_id INTO v_member_id, v_existing_user_id
    FROM public.members
    WHERE server_id = v_server_id 
      AND LOWER(TRIM(name)) = LOWER(TRIM(v_requested_name))
    LIMIT 1;

    IF v_member_id IS NULL THEN
      RAISE EXCEPTION 'Member "%" not found in this server.', trim(v_requested_name);
    END IF;

    -- If member is already linked to a different user, reject
    IF v_existing_user_id IS NOT NULL AND v_existing_user_id != v_user_id THEN
      RAISE EXCEPTION 'Member "%" is already claimed by another user.', trim(v_requested_name);
    END IF;

    -- Link member to the claiming user
    UPDATE public.members SET user_id = v_user_id
    WHERE id = v_member_id AND user_id IS NULL;

    -- Add to server_members
    INSERT INTO public.server_members (server_id, user_id, role)
    VALUES (v_server_id, v_user_id, 'member')
    ON CONFLICT (server_id, user_id) DO NOTHING;

    -- Update claim status
    UPDATE public.member_claim_requests 
    SET status = 'accepted', reviewer_id = auth.uid(), resolved_at = now()
    WHERE id = p_request_id;

  ELSIF p_action = 'decline' THEN
    UPDATE public.member_claim_requests 
    SET status = 'declined', reviewer_id = auth.uid(), 
        decline_reason = p_reason, resolved_at = now()
    WHERE id = p_request_id;
  ELSE
    RAISE EXCEPTION 'Invalid action: %', p_action;
  END IF;

  RETURN v_member_id;
END;
$$;
