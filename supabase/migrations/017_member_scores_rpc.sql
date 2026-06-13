-- 017_member_scores_rpc: RPC to compute performance scores for all members in a server
-- Matches MemberProfileView score formula exactly:
--   totalEvents * 2      → capped at 40
--   cp_growth_30d / 100  → capped at 30 (min 0)
--   20 - daysSinceActive * 1.5 → min 0
--   recent14d * 2        → capped at 10 (hunt attendance only)
--   Final: round(clamp(0, sum, 100))

DROP FUNCTION IF EXISTS public.get_member_scores(UUID);

CREATE OR REPLACE FUNCTION public.get_member_scores(p_server_id UUID)
RETURNS TABLE(member_id UUID, score INT, cp_growth_30d INT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH now_ts AS (SELECT EXTRACT(EPOCH FROM NOW())::bigint AS ts),
  -- All-time attendance count (boss hunts only)
  hunt_att AS (
    SELECT ar.member_id, COUNT(*)::int AS cnt
    FROM public.attendance_records ar
    JOIN public.members m ON m.id = ar.member_id
    WHERE m.server_id = p_server_id
    GROUP BY ar.member_id
  ),
  -- All-time activity attendance count
  act_att AS (
    SELECT aa.member_id, COUNT(*)::int AS cnt
    FROM public.activity_attendance aa
    JOIN public.members m ON m.id = aa.member_id
    WHERE m.server_id = p_server_id
    GROUP BY aa.member_id
  ),
  -- Most recent attendance date (from either table), in epoch seconds
  last_att AS (
    SELECT member_id, MAX(ts) AS max_ts
    FROM (
      SELECT ar.member_id, EXTRACT(EPOCH FROM ar.created_at)::bigint AS ts
      FROM public.attendance_records ar
      JOIN public.members m ON m.id = ar.member_id
      WHERE m.server_id = p_server_id
      UNION ALL
      SELECT aa.member_id, EXTRACT(EPOCH FROM aa.created_at)::bigint AS ts
      FROM public.activity_attendance aa
      JOIN public.members m ON m.id = aa.member_id
      WHERE m.server_id = p_server_id
    ) sub
    GROUP BY member_id
  ),
  -- CP growth in last 30 days: latest - oldest (need ≥2 approved updates)
  -- Join through members (not cp_updates.server_id) to match profile behavior
  cp_30d AS (
    SELECT cu.member_id,
      CASE WHEN COUNT(*) >= 2
        THEN (array_agg(cu.new_cp ORDER BY cu.submitted_at DESC))[1]
           - (array_agg(cu.new_cp ORDER BY cu.submitted_at ASC))[1]
        ELSE 0
      END AS growth
    FROM public.cp_updates cu
    JOIN public.members m ON m.id = cu.member_id
    WHERE cu.status = 'approved'
      AND m.server_id = p_server_id
      AND cu.submitted_at >= NOW() - INTERVAL '30 days'
    GROUP BY cu.member_id
  ),
  -- Recent 14-day hunt attendance count
  recent_14d AS (
    SELECT ar.member_id, COUNT(*)::int AS cnt
    FROM public.attendance_records ar
    JOIN public.members m ON m.id = ar.member_id
    WHERE m.server_id = p_server_id
      AND ar.created_at >= NOW() - INTERVAL '14 days'
    GROUP BY ar.member_id
  ),
  combined AS (
    SELECT
      m.id AS mid,
      COALESCE(hunt_att.cnt, 0) + COALESCE(act_att.cnt, 0) AS total_events,
      COALESCE(cp_30d.growth, 0) AS cp_growth_30d,
      COALESCE(last_att.max_ts, 0) AS last_att_epoch,
      COALESCE(recent_14d.cnt, 0) AS recent_14d_cnt
    FROM public.members m
    LEFT JOIN hunt_att ON hunt_att.member_id = m.id
    LEFT JOIN act_att ON act_att.member_id = m.id
    LEFT JOIN cp_30d ON cp_30d.member_id = m.id
    LEFT JOIN last_att ON last_att.member_id = m.id
    LEFT JOIN recent_14d ON recent_14d.member_id = m.id
    WHERE m.server_id = p_server_id
  )
  SELECT
    combined.mid,
    ROUND(LEAST(100, GREATEST(0,
      LEAST(40, combined.total_events * 2)::numeric
      + LEAST(30, GREATEST(0, combined.cp_growth_30d / 100))::numeric
      + GREATEST(0, 20 - FLOOR(
          CASE WHEN combined.last_att_epoch > 0
            THEN ((SELECT ts FROM now_ts) - combined.last_att_epoch)::numeric / 86400
            ELSE 999
          END
        ) * 1.5)::numeric
      + LEAST(10, combined.recent_14d_cnt * 2)::numeric
    )))::int AS score,
    combined.cp_growth_30d::int AS cp_growth_30d
  FROM combined;
$$;

-- Allow both authenticated users and viewers (anon) to execute
GRANT EXECUTE ON FUNCTION public.get_member_scores(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_member_scores(UUID) TO anon;
