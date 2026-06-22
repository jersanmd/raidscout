-- 098: Member Claim System + Discord User ID
-- Allows guild members to claim their profile and access the web UI.

-- 0. Add user_id and discord_user_id to members (if not exists)
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS discord_user_id TEXT;

-- 1. Member claim requests table
CREATE TABLE IF NOT EXISTS public.member_claim_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_name TEXT NOT NULL,           -- in-game character name
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'declined'
  reviewer_id UUID REFERENCES auth.users(id),
  decline_reason TEXT,
  is_read BOOLEAN DEFAULT false,          -- set to true when player views notification
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_claim_req_unique 
  ON public.member_claim_requests(server_id, user_id, requested_name) 
  WHERE status = 'pending';

-- 3. RLS: members read own, owners/mods read+write all
ALTER TABLE public.member_claim_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own claims" ON public.member_claim_requests;
CREATE POLICY "Users can read own claims" ON public.member_claim_requests
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Staff can manage claims" ON public.member_claim_requests;
CREATE POLICY "Staff can manage claims" ON public.member_claim_requests
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.server_members
      WHERE server_id = member_claim_requests.server_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'moderator')
    )
  );

-- 4. RPC: submit a claim request
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
BEGIN
  INSERT INTO public.member_claim_requests (server_id, user_id, requested_name)
  VALUES (p_server_id, auth.uid(), trim(p_requested_name))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- 5. RPC: get pending claims for a server (owner/mod only)
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
  ORDER BY cr.created_at ASC;
$$;

-- 6. RPC: get current user's claims across all servers
CREATE OR REPLACE FUNCTION public.get_my_claims()
RETURNS TABLE(
  id UUID,
  server_id UUID,
  server_name TEXT,
  requested_name TEXT,
  status TEXT,
  decline_reason TEXT,
  is_read BOOLEAN,
  created_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 
    cr.id, cr.server_id, s.name AS server_name,
    cr.requested_name, cr.status, cr.decline_reason, cr.is_read,
    cr.created_at, cr.resolved_at
  FROM public.member_claim_requests cr
  JOIN public.servers s ON s.id = cr.server_id
  WHERE cr.user_id = auth.uid()
  ORDER BY cr.created_at DESC;
$$;

-- 7. RPC: review (accept/decline) a claim request
CREATE OR REPLACE FUNCTION public.review_claim_request(
  p_request_id UUID,
  p_action TEXT,           -- 'accept' or 'decline'
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
BEGIN
  -- Fetch the claim request
  SELECT server_id, user_id, requested_name 
  INTO v_server_id, v_user_id, v_requested_name
  FROM public.member_claim_requests WHERE id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim request not found';
  END IF;

  IF p_action = 'accept' THEN
    -- Case-insensitive + whitespace-trimmed match on member name
    SELECT id INTO v_member_id
    FROM public.members
    WHERE server_id = v_server_id 
      AND LOWER(TRIM(name)) = LOWER(TRIM(v_requested_name))
      AND user_id IS NULL
    LIMIT 1;

    IF v_member_id IS NULL THEN
      -- No matching member row — create one
      INSERT INTO public.members (server_id, name, user_id, is_active)
      VALUES (v_server_id, trim(v_requested_name), v_user_id, true)
      RETURNING id INTO v_member_id;
    ELSE
      -- Link existing member to auth user
      UPDATE public.members SET user_id = v_user_id
      WHERE id = v_member_id;
    END IF;

    -- Add to server_members as 'member' (read-only)
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
