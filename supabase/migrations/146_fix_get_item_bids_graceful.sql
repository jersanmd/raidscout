-- 146: Fix get_item_bids — return empty instead of raising exception when not authorized
-- Prevents 400 errors for unlinked users with stale UI or viewers
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

  -- Only return bids if the caller is a server member or admin
  IF EXISTS (
    SELECT 1 FROM public.server_members sm
    WHERE sm.server_id = v_server_id AND sm.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RETURN QUERY
    SELECT 
      b.id, m.name AS member_name, b.bid_amount, b.status, b.created_at
    FROM public.dkp_bids b
    JOIN public.members m ON m.id = b.member_id
    WHERE b.item_id = p_item_id
    ORDER BY b.bid_amount DESC;
  END IF;
  -- If not authorized, return empty set (no error)
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_item_bids(UUID) TO authenticated;
