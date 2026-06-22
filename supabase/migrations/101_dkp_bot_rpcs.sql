-- 101: DKP RPCs for Discord bot — lookup by discord_user_id

-- Lookup member DKP by Discord user ID
CREATE OR REPLACE FUNCTION public.get_member_dkp_by_discord(
  p_discord_user_id TEXT,
  p_server_id UUID
)
RETURNS TABLE(balance BIGINT, earned_this_week BIGINT, spent_this_week BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 
    COALESCE(SUM(dt.amount), 0)::BIGINT AS balance,
    COALESCE(SUM(CASE WHEN dt.amount > 0 AND dt.created_at > now() - INTERVAL '7 days' THEN dt.amount ELSE 0 END), 0)::BIGINT AS earned_this_week,
    COALESCE(SUM(CASE WHEN dt.amount < 0 AND dt.created_at > now() - INTERVAL '7 days' THEN -dt.amount ELSE 0 END), 0)::BIGINT AS spent_this_week
  FROM public.members m
  LEFT JOIN public.dkp_transactions dt ON dt.member_id = m.id AND dt.server_id = p_server_id
  WHERE m.discord_user_id = p_discord_user_id AND m.server_id = p_server_id
  GROUP BY m.id;
$$;

-- Lookup member bids by Discord user ID
CREATE OR REPLACE FUNCTION public.get_member_bids_by_discord(
  p_discord_user_id TEXT,
  p_server_id UUID
)
RETURNS TABLE(
  id UUID,
  item_name TEXT,
  bid_amount INTEGER,
  status TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 
    b.id, i.name AS item_name, b.bid_amount, b.status, b.created_at
  FROM public.dkp_bids b
  JOIN public.members m ON m.id = b.member_id
  JOIN public.items i ON i.id = b.item_id
  WHERE m.discord_user_id = p_discord_user_id AND b.server_id = p_server_id AND b.status = 'active'
  ORDER BY b.created_at DESC;
$$;
