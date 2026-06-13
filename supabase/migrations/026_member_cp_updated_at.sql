-- 026_member_cp_updated_at: Track when CP was last updated
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS cp_updated_at TIMESTAMPTZ;

-- Backfill from most recent cp_update per member
UPDATE public.members m
SET cp_updated_at = (
  SELECT MAX(cu.submitted_at)
  FROM public.cp_updates cu
  WHERE cu.member_id = m.id
)
WHERE EXISTS (
  SELECT 1 FROM public.cp_updates cu WHERE cu.member_id = m.id
);

-- Update RPC to return cp_updated_at
CREATE OR REPLACE FUNCTION public.get_member_scores(p_server_id UUID)
RETURNS TABLE(
  member_id UUID,
  score INTEGER,
  cp_growth_30d INTEGER,
  cp_updated_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH latest_cp AS (
    SELECT DISTINCT ON (member_id)
      member_id,
      new_cp,
      submitted_at
    FROM public.cp_updates
    WHERE server_id = p_server_id
    ORDER BY member_id, submitted_at DESC
  ),
  cp_30d_growth AS (
    SELECT
      member_id,
      MAX(new_cp) - MIN(new_cp) AS growth
    FROM public.cp_updates
    WHERE server_id = p_server_id
      AND submitted_at >= NOW() - INTERVAL '30 days'
    GROUP BY member_id
  )
  SELECT
    m.id AS member_id,
    COALESCE(
      CASE
        WHEN COALESCE((lc.new_cp - m.combat_power), 0) > 0 THEN 100
        WHEN (lc.submitted_at IS NULL OR lc.submitted_at < NOW() - INTERVAL '14 days') THEN
          CASE WHEN m.combat_power IS NOT NULL THEN
            GREATEST(0, 100 - EXTRACT(DAY FROM NOW() - COALESCE(lc.submitted_at, m.created_at))::int)
          ELSE 0 END
        ELSE 100
      END,
      0
    )::int AS score,
    COALESCE(g.growth, 0)::int AS cp_growth_30d,
    lc.submitted_at AS cp_updated_at
  FROM public.members m
  LEFT JOIN latest_cp lc ON lc.member_id = m.id
  LEFT JOIN cp_30d_growth g ON g.member_id = m.id
  WHERE m.server_id = p_server_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_scores(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_member_scores(UUID) TO anon;
