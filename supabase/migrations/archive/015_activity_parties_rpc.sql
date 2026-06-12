-- 015_activity_parties_rpc: Functions for managing activity parties

CREATE OR REPLACE FUNCTION public.set_activity_parties(
  p_activity_instance_id UUID,
  p_parties JSONB -- [{party_number: 1, member_ids: [uuid, ...]}, ...]
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete existing parties for this instance
  DELETE FROM public.activity_parties WHERE activity_instance_id = p_activity_instance_id;
  
  -- Insert new parties
  FOR i IN 0..jsonb_array_length(p_parties) - 1 LOOP
    INSERT INTO public.activity_parties (activity_instance_id, party_number, member_ids)
    VALUES (
      p_activity_instance_id,
      (p_parties->i->>'party_number')::INTEGER,
      (SELECT array_agg(v::UUID) FROM jsonb_array_elements_text(p_parties->i->'member_ids') v)
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_activity_attendance(
  p_activity_instance_id UUID,
  p_member_id UUID,
  p_present BOOLEAN DEFAULT true
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.activity_attendance (activity_instance_id, member_id, present)
  VALUES (p_activity_instance_id, p_member_id, p_present)
  ON CONFLICT (activity_instance_id, member_id)
  DO UPDATE SET present = EXCLUDED.present;
END;
$$;
