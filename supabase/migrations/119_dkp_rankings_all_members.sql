-- 119: get_server_dkp_rankings - include all members (even 0 DKP) + guild name
DROP FUNCTION IF EXISTS public.get_server_dkp_rankings(uuid);
CREATE OR REPLACE FUNCTION public.get_server_dkp_rankings(p_server_id UUID)
RETURNS TABLE(
  member_id UUID,
  member_name TEXT,
  balance BIGINT,
  rank INTEGER,
  guild_name TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 
    m.id AS member_id, m.name AS member_name, COALESCE(db.balance, 0)::BIGINT AS balance,
    ROW_NUMBER() OVER (ORDER BY COALESCE(db.balance, 0) DESC)::INTEGER AS rank,
    g.name AS guild_name
  FROM public.members m
  LEFT JOIN public.dkp_balances db ON db.member_id = m.id AND db.server_id = p_server_id
  LEFT JOIN public.guilds g ON g.id = m.guild_id
  WHERE m.server_id = p_server_id
  ORDER BY COALESCE(db.balance, 0) DESC;
$$;
