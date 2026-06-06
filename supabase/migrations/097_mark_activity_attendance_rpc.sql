-- 097_mark_activity_attendance_rpc: RPC to upsert activity attendance records

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
