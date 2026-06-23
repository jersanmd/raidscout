-- 117: Fix get_member_dkp to exclude refunds from earned_total and only count won bids as spent
DROP FUNCTION IF EXISTS public.get_member_dkp(uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_member_dkp(p_member_id UUID, p_server_id UUID)
RETURNS TABLE(balance BIGINT, earned_total BIGINT, spent_total BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 
    COALESCE(SUM(dt.amount), 0)::BIGINT AS balance,
    COALESCE(SUM(CASE WHEN dt.type IN ('earn_kill', 'earn_adjustment') THEN dt.amount ELSE 0 END), 0)::BIGINT AS earned_total,
    COALESCE((SELECT SUM(b.bid_amount) FROM public.dkp_bids b WHERE b.member_id = p_member_id AND b.server_id = p_server_id AND b.status = 'won'), 0)::BIGINT AS spent_total
  FROM public.dkp_transactions dt
  WHERE dt.member_id = p_member_id AND dt.server_id = p_server_id;
$$;
