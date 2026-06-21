-- get_member_growth RPC — returns 7d + 30d + all-time CP growth per member
-- Growth = current_cp - baseline (last CP before period, or earliest CP in period)
DROP FUNCTION IF EXISTS get_member_growth(uuid);

CREATE OR REPLACE FUNCTION get_member_growth(p_server_id uuid)
RETURNS TABLE(
  member_id uuid,
  growth_7d bigint,
  growth_30d bigint,
  growth_all bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  WITH before_7d AS (
    SELECT DISTINCT ON (cu.member_id) cu.member_id, cu.new_cp
    FROM cp_updates cu WHERE cu.server_id = p_server_id AND cu.status = 'approved'
      AND cu.submitted_at < NOW() - INTERVAL '7 days'
    ORDER BY cu.member_id, cu.submitted_at DESC
  ),
  in_7d AS (
    SELECT cu.member_id, MIN(cu.new_cp) AS min_cp
    FROM cp_updates cu WHERE cu.server_id = p_server_id AND cu.status = 'approved'
      AND cu.submitted_at >= NOW() - INTERVAL '7 days'
    GROUP BY cu.member_id
  ),
  before_30d AS (
    SELECT DISTINCT ON (cu.member_id) cu.member_id, cu.new_cp
    FROM cp_updates cu WHERE cu.server_id = p_server_id AND cu.status = 'approved'
      AND cu.submitted_at < NOW() - INTERVAL '30 days'
    ORDER BY cu.member_id, cu.submitted_at DESC
  ),
  in_30d AS (
    SELECT cu.member_id, MIN(cu.new_cp) AS min_cp
    FROM cp_updates cu WHERE cu.server_id = p_server_id AND cu.status = 'approved'
      AND cu.submitted_at >= NOW() - INTERVAL '30 days'
    GROUP BY cu.member_id
  ),
  in_all AS (
    SELECT cu.member_id, MIN(cu.new_cp) AS min_cp
    FROM cp_updates cu WHERE cu.server_id = p_server_id AND cu.status = 'approved'
    GROUP BY cu.member_id
  )
  SELECT
    m.id,
    GREATEST(0, m.combat_power - COALESCE(b7.new_cp, i7.min_cp, m.combat_power))::bigint,
    GREATEST(0, m.combat_power - COALESCE(b30.new_cp, i30.min_cp, m.combat_power))::bigint,
    GREATEST(0, m.combat_power - COALESCE(ia.min_cp, m.combat_power))::bigint
  FROM members m
  LEFT JOIN before_7d b7 ON b7.member_id = m.id
  LEFT JOIN in_7d i7 ON i7.member_id = m.id
  LEFT JOIN before_30d b30 ON b30.member_id = m.id
  LEFT JOIN in_30d i30 ON i30.member_id = m.id
  LEFT JOIN in_all ia ON ia.member_id = m.id
  WHERE m.server_id = p_server_id AND m.combat_power IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION get_member_growth(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_member_growth(uuid) TO anon;
