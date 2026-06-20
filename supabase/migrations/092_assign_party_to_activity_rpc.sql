-- Migration: assign_party_to_activity RPC
-- Allows linking a static party to an activity (instead of a boss)
CREATE OR REPLACE FUNCTION public.assign_party_to_activity(
  p_party_id UUID, p_activity_id UUID
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.static_parties
  SET activity_id = p_activity_id, boss_id = NULL
  WHERE id = p_party_id;
END; $$;
