-- get_top_cp_growth RPC — returns top CP growers over a configurable day range
-- Used by Analytics → Top Combat Power section
DROP FUNCTION IF EXISTS get_top_cp_growth(uuid, integer, integer);

CREATE OR REPLACE FUNCTION get_top_cp_growth(
  p_server_id uuid,
  p_days integer DEFAULT 30,
  p_limit integer DEFAULT 10
)
RETURNS TABLE(
  member_id uuid,
  player_name text,
  growth bigint,
  current_cp bigint,
  update_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH member_updates AS (
    SELECT
      cu.member_id,
      cu.player_name,
      COALESCE(cu.new_cp, 0) - COALESCE(cu.old_cp, 0) AS cp_growth,
      cu.new_cp AS latest_cp,
      cu.submitted_at
    FROM cp_updates cu
    WHERE cu.server_id = p_server_id
      AND cu.status = 'approved'
      AND cu.old_cp IS NOT NULL
      AND (p_days <= 0 OR cu.submitted_at >= NOW() - (p_days || ' days')::INTERVAL)
  ),
  aggregated AS (
    SELECT
      mu.member_id,
      mu.player_name,
      SUM(mu.cp_growth)::bigint AS growth,
      COUNT(*)::bigint AS update_count
    FROM member_updates mu
    GROUP BY mu.member_id, mu.player_name
  ),
  ranked AS (
    SELECT
      a.member_id,
      a.player_name,
      a.growth,
      COALESCE(m.combat_power, 0)::bigint AS current_cp,
      a.update_count
    FROM aggregated a
    LEFT JOIN members m ON m.id = a.member_id
    ORDER BY a.growth DESC
    LIMIT p_limit
  )
  SELECT * FROM ranked;
END;
$$;
