-- 20260628000001: Fix weekly attendance RPCs for viewers (SECURITY DEFINER to bypass RLS)

-- 1. Fix get_weekly_attendance — add SECURITY DEFINER so viewers can see attendance counts
DROP FUNCTION IF EXISTS get_weekly_attendance(UUID, TIMESTAMPTZ);
CREATE OR REPLACE FUNCTION get_weekly_attendance(
  p_server_id UUID,
  p_since TIMESTAMPTZ
) RETURNS TABLE(member_id UUID, count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ar.member_id, COUNT(*)::BIGINT
  FROM public.attendance_records ar
  JOIN public.death_records dr ON dr.id = ar.death_record_id
  WHERE dr.server_id = p_server_id AND dr.death_time >= p_since
  GROUP BY ar.member_id
  UNION ALL
  SELECT aa.member_id, COUNT(*)::BIGINT
  FROM public.activity_attendance aa
  JOIN public.activity_instances ai ON ai.id = aa.activity_instance_id
  JOIN public.activities a ON a.id = ai.activity_id
  WHERE a.server_id = p_server_id AND ai.end_time >= p_since AND ai.end_time IS NOT NULL
  GROUP BY aa.member_id
$$;

GRANT EXECUTE ON FUNCTION get_weekly_attendance(UUID, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION get_weekly_attendance(UUID, TIMESTAMPTZ) TO anon;

-- 2. New RPC for per-guild weekly totals (denominator for weekly attendance %)
-- Replaces client-side direct queries that fail for viewers due to RLS on death_records.
CREATE OR REPLACE FUNCTION get_guild_weekly_totals(
  p_server_id UUID,
  p_since TIMESTAMPTZ
) RETURNS TABLE(guild_id UUID, total BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  -- Owned boss kills this week
  SELECT dr.owner_guild_id AS guild_id, COUNT(*)::BIGINT AS total
  FROM public.death_records dr
  WHERE dr.server_id = p_server_id AND dr.death_time >= p_since AND dr.owner_guild_id IS NOT NULL
  GROUP BY dr.owner_guild_id
  UNION ALL
  -- Assisted boss kills: guilds that assist bosses that died this week
  SELECT ba.assistant_guild_id AS guild_id, COUNT(*)::BIGINT AS total
  FROM public.boss_assists ba
  JOIN public.death_records dr ON dr.boss_id = ba.boss_id AND dr.server_id = p_server_id AND dr.death_time >= p_since
  WHERE ba.server_id = p_server_id
  GROUP BY ba.assistant_guild_id
  UNION ALL
  -- Activity instances completed this week
  SELECT ag.guild_id, COUNT(*)::BIGINT AS total
  FROM public.activity_instances ai
  JOIN public.activities a ON a.id = ai.activity_id AND a.server_id = p_server_id
  JOIN public.activity_guilds ag ON ag.activity_id = a.id
  WHERE ai.end_time >= p_since
  GROUP BY ag.guild_id
$$;

GRANT EXECUTE ON FUNCTION get_guild_weekly_totals(UUID, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION get_guild_weekly_totals(UUID, TIMESTAMPTZ) TO anon;

-- 3. Member attendance history (for MemberProfileView trend chart — bypasses death_records RLS)
CREATE OR REPLACE FUNCTION get_member_attendance_history(
  p_member_id UUID,
  p_limit INTEGER DEFAULT 5000
) RETURNS TABLE(
  death_record_id UUID,
  created_at TIMESTAMPTZ,
  death_time TIMESTAMPTZ,
  boss_id UUID,
  boss_name TEXT,
  boss_image_url TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ar.death_record_id, ar.created_at,
         dr.death_time, dr.boss_id,
         b.name AS boss_name, b.image_url AS boss_image_url
  FROM public.attendance_records ar
  JOIN public.death_records dr ON dr.id = ar.death_record_id
  JOIN public.bosses b ON b.id = dr.boss_id
  WHERE ar.member_id = p_member_id
  ORDER BY ar.created_at DESC
  LIMIT p_limit
$$;

GRANT EXECUTE ON FUNCTION get_member_attendance_history(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_member_attendance_history(UUID, INTEGER) TO anon;

-- 4. Member activity attendance (for MemberProfileView trend chart — bypasses activity_instances RLS)
CREATE OR REPLACE FUNCTION get_member_activity_attendance(
  p_member_id UUID,
  p_limit INTEGER DEFAULT 5000
) RETURNS TABLE(
  activity_instance_id UUID,
  created_at TIMESTAMPTZ,
  present BOOLEAN,
  end_time TIMESTAMPTZ,
  activity_id UUID,
  activity_name TEXT,
  activity_image_url TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT aa.activity_instance_id, aa.created_at, aa.present,
         ai.end_time, ai.activity_id,
         a.name AS activity_name, a.image_url AS activity_image_url
  FROM public.activity_attendance aa
  JOIN public.activity_instances ai ON ai.id = aa.activity_instance_id
  JOIN public.activities a ON a.id = ai.activity_id
  WHERE aa.member_id = p_member_id
  ORDER BY aa.created_at DESC
  LIMIT p_limit
$$;

GRANT EXECUTE ON FUNCTION get_member_activity_attendance(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_member_activity_attendance(UUID, INTEGER) TO anon;

-- 5. Member loot history (for MemberProfileView — bypasses distributions RLS if any)
CREATE OR REPLACE FUNCTION get_member_loot_history(
  p_member_id UUID,
  p_limit INTEGER DEFAULT 5000
) RETURNS TABLE(
  id UUID,
  item_id UUID,
  distributed_at TIMESTAMPTZ,
  item_name TEXT,
  item_rarity TEXT,
  item_image_url TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT d.id, d.item_id, d.distributed_at,
         i.name AS item_name, i.rarity AS item_rarity, i.image_url AS item_image_url
  FROM public.distributions d
  LEFT JOIN public.items i ON i.id = d.item_id
  WHERE d.member_id = p_member_id
  ORDER BY d.distributed_at DESC
  LIMIT p_limit
$$;

GRANT EXECUTE ON FUNCTION get_member_loot_history(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_member_loot_history(UUID, INTEGER) TO anon;
