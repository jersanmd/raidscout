-- 097: Weekly attendance RPC — server-scoped counts for MembersView & MemberProfileView
CREATE OR REPLACE FUNCTION get_weekly_attendance(
  p_server_id UUID,
  p_since TIMESTAMPTZ
) RETURNS TABLE(member_id UUID, count BIGINT)
LANGUAGE sql
STABLE
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
