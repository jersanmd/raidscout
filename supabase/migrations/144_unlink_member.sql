-- 144: unlink_member — allows staff to undo a wrong claim acceptance by clearing members.user_id
CREATE OR REPLACE FUNCTION public.unlink_member(p_member_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_server_id UUID;
  v_user_id UUID;
  v_member_name TEXT;
  v_other_members INTEGER;
BEGIN
  -- Get the member's server and linked user
  SELECT server_id, user_id, name INTO v_server_id, v_user_id, v_member_name
  FROM public.members WHERE id = p_member_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Member is not claimed'; END IF;

  -- Only owner/moderator of that server can unlink
  IF NOT EXISTS (
    SELECT 1 FROM public.server_members
    WHERE server_id = v_server_id AND user_id = auth.uid()
      AND role IN ('owner', 'moderator')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Clear the link
  UPDATE public.members SET user_id = NULL WHERE id = p_member_id;

  -- If the unlinked user has no other members in this server, remove from server_members
  SELECT COUNT(*) INTO v_other_members FROM public.members
  WHERE server_id = v_server_id AND user_id = v_user_id;

  IF v_other_members = 0 THEN
    DELETE FROM public.server_members
    WHERE server_id = v_server_id AND user_id = v_user_id AND role = 'member';
  END IF;

  -- Notify the unlinked user
  INSERT INTO public.notifications (user_id, server_id, type, title, body, metadata)
  VALUES (v_user_id, v_server_id, 'member_unlinked',
    'Member unlinked',
    '"' || v_member_name || '" has been unlinked from your account by a server moderator. You may submit a new claim if this was a mistake.',
    jsonb_build_object('member_id', p_member_id, 'member_name', v_member_name));

  -- Also mark any accepted claim requests for this member as "unlinked"
  UPDATE public.member_claim_requests
  SET status = 'declined', decline_reason = 'Claim unlinked by staff', resolved_at = now()
  WHERE server_id = v_server_id AND user_id = v_user_id
    AND requested_name ILIKE v_member_name
    AND status = 'accepted';
END;
$$;

GRANT EXECUTE ON FUNCTION public.unlink_member(UUID) TO authenticated;
