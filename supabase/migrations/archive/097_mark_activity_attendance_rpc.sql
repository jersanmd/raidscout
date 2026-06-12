-- 097_mark_activity_attendance_rpc: RPCs for activity attendance read/write

-- Read: fetch all present attendees for an activity instance
CREATE OR REPLACE FUNCTION public.fetch_activity_attendance(
  p_activity_instance_id UUID
)
RETURNS TABLE(id UUID, member_id UUID)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT aa.id, aa.member_id
  FROM public.activity_attendance aa
  WHERE aa.activity_instance_id = p_activity_instance_id
    AND aa.present = true;
$$;

GRANT EXECUTE ON FUNCTION public.fetch_activity_attendance(UUID) TO authenticated;

-- Write: upsert or remove attendance
CREATE OR REPLACE FUNCTION public.mark_activity_attendance(
  p_activity_instance_id UUID,
  p_member_id UUID,
  p_present BOOLEAN DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_present THEN
    INSERT INTO public.activity_attendance (activity_instance_id, member_id, present)
    VALUES (p_activity_instance_id, p_member_id, true)
    ON CONFLICT (activity_instance_id, member_id)
    DO UPDATE SET present = true;
  ELSE
    DELETE FROM public.activity_attendance
    WHERE activity_instance_id = p_activity_instance_id
      AND member_id = p_member_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_activity_attendance(UUID, UUID, BOOLEAN) TO authenticated;
