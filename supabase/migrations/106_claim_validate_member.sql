-- 106: Validate member name exists before allowing claim submission
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

  INSERT INTO public.member_claim_requests (server_id, user_id, requested_name)
  VALUES (p_server_id, auth.uid(), trim(p_requested_name))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
