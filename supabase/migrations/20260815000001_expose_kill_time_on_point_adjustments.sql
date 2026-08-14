-- Let the member modal hide a late-attendance credit that isn't scoring.
--
-- A linked credit only counts while its own kill sits outside the current window
-- (the 20260814000001 guard). Cancel a finalization and the cutoff moves back, the
-- kill scores directly, and the credit stands down -- but the modal's adjustment
-- list filters on created_at alone, so those rows stay on screen contributing 0.
-- LeaderboardView also sums that same list into the member's adjustment total, so
-- the modal wouldn't reconcile against the leaderboard number.
--
-- Exposing the linked kill's time lets the client apply the same rule the
-- leaderboard does. NULL for ordinary manual staff adjustments, which are never
-- filtered.
--
-- Return type changes, so this is a DROP + CREATE rather than CREATE OR REPLACE.
-- anon holds EXECUTE (viewers open this modal) and the grant is restored below --
-- dropping the function would otherwise silently take it away.

DROP FUNCTION IF EXISTS public.fetch_point_adjustments(UUID, UUID);

CREATE FUNCTION public.fetch_point_adjustments(p_server_id UUID, p_member_id UUID DEFAULT NULL)
RETURNS TABLE(id UUID, member_id UUID, member_name TEXT, points INTEGER, reason TEXT,
              adjusted_by_name TEXT, created_at TIMESTAMPTZ, kill_time TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    pa.id,
    pa.member_id,
    m.name AS member_name,
    pa.points,
    pa.reason,
    CASE WHEN pa.adjusted_by IS NULL AND pa.attendance_record_id IS NOT NULL THEN 'System'
         ELSE COALESCE(ur.raw_user_meta_data->>'name', ur.email, 'Unknown') END AS adjusted_by_name,
    pa.created_at,
    dr.death_time AS kill_time
  FROM public.point_adjustments pa
  JOIN public.members m ON m.id = pa.member_id
  LEFT JOIN auth.users ur ON ur.id = pa.adjusted_by
  LEFT JOIN public.attendance_records ar ON ar.id = pa.attendance_record_id
  LEFT JOIN public.death_records dr ON dr.id = ar.death_record_id
  WHERE pa.server_id = p_server_id
    AND (p_member_id IS NULL OR pa.member_id = p_member_id)
  ORDER BY pa.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.fetch_point_adjustments(UUID, UUID) TO anon, authenticated, service_role;
