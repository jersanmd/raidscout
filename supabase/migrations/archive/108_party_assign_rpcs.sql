-- 108_party_assign_rpcs: SECURITY DEFINER RPCs to assign/unlink parties to bosses/activities
-- Fixes RLS issue where direct .update() on static_parties was silently blocked (no UPDATE policy)

-- RPC: Assign a party to a boss
CREATE OR REPLACE FUNCTION public.assign_party_to_boss(
  p_party_id UUID, p_boss_id UUID
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.static_parties
  SET boss_id = p_boss_id, activity_id = NULL
  WHERE id = p_party_id;
END; $$;

-- RPC: Unlink a party from its boss/activity
CREATE OR REPLACE FUNCTION public.unlink_party(p_party_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.static_parties
  SET boss_id = NULL, activity_id = NULL
  WHERE id = p_party_id;
END; $$;