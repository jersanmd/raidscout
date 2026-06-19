-- get_member_growth RPC — returns 7d + 30d + all-time CP growth per member
-- Uses MAX(new_cp) - MIN(new_cp) so it works without old_cp populated
-- Requires ≥2 approved updates in the period to compute growth
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
  WITH growth_7d AS (
    SELECT
      cu.member_id,
      CASE WHEN COUNT(*) >= 2
        THEN MAX(cu.new_cp) - MIN(cu.new_cp)
        ELSE 0
      END AS growth
    FROM cp_updates cu
    WHERE cu.server_id = p_server_id
      AND cu.status = 'approved'
      AND cu.submitted_at >= NOW() - INTERVAL '7 days'
    GROUP BY cu.member_id
  ),
  growth_30d AS (
    SELECT
      cu.member_id,
      CASE WHEN COUNT(*) >= 2
        THEN MAX(cu.new_cp) - MIN(cu.new_cp)
        ELSE 0
      END AS growth
    FROM cp_updates cu
    WHERE cu.server_id = p_server_id
      AND cu.status = 'approved'
      AND cu.submitted_at >= NOW() - INTERVAL '30 days'
    GROUP BY cu.member_id
  ),
  growth_all AS (
    SELECT
      cu.member_id,
      CASE WHEN COUNT(*) >= 2
        THEN MAX(cu.new_cp) - MIN(cu.new_cp)
        ELSE 0
      END AS growth
    FROM cp_updates cu
    WHERE cu.server_id = p_server_id
      AND cu.status = 'approved'
    GROUP BY cu.member_id
  )
  SELECT
    m.id,
    COALESCE(g7.growth, 0)::bigint,
    COALESCE(g30.growth, 0)::bigint,
    COALESCE(ga.growth, 0)::bigint
  FROM members m
  LEFT JOIN growth_7d g7 ON g7.member_id = m.id
  LEFT JOIN growth_30d g30 ON g30.member_id = m.id
  LEFT JOIN growth_all ga ON ga.member_id = m.id
  WHERE m.server_id = p_server_id AND m.combat_power IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION get_member_growth(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_member_growth(uuid) TO anon;


GRANT EXECUTE ON FUNCTION get_member_growth(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_member_growth(uuid) TO anon;
