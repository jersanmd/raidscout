-- Fix: award_dkp_on_kill's removal loop had no idempotency guard, unlike its
-- sibling award loop. Every call to the RPC for a given death_record_id --
-- triggered by ANY attendance edit on that kill, not just the removal itself --
-- re-inserted a fresh -amount "Removed from attendance" dkp_transactions row
-- for every member who remained absent. This silently corrupted real DKP
-- balances (not just leaderboard display points): confirmed 324 duplicate
-- groups / 3332 extra rows across 50 members on one server, some members
-- wrongly docked up to 39 DKP for a single removal.

CREATE OR REPLACE FUNCTION public.award_dkp_on_kill(p_death_record_id UUID)
RETURNS SETOF UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_server_id UUID; v_boss_points INTEGER; v_multiplier REAL; v_amount INTEGER;
  v_attendee RECORD; v_existing RECORD; v_txn_id UUID;
BEGIN
  SELECT dr.server_id, COALESCE(b.boss_points, 1) INTO v_server_id, v_boss_points
  FROM public.death_records dr JOIN public.bosses b ON b.id = dr.boss_id WHERE dr.id = p_death_record_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT COALESCE(dkp_multiplier, 1.0) INTO v_multiplier FROM public.dkp_config WHERE server_id = v_server_id;
  IF NOT FOUND OR v_multiplier = 0 THEN RETURN; END IF;
  v_amount := ROUND(v_boss_points * v_multiplier);
  FOR v_attendee IN SELECT ar.member_id FROM public.attendance_records ar WHERE ar.death_record_id = p_death_record_id
  LOOP
    SELECT id INTO v_existing FROM public.dkp_transactions
    WHERE reference_id = p_death_record_id AND reference_type = 'death_record' AND member_id = v_attendee.member_id AND type = 'earn_kill' LIMIT 1;
    IF v_existing.id IS NULL THEN
      INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
      VALUES (v_server_id, v_attendee.member_id, v_amount, 'earn_kill', 'Boss kill', p_death_record_id, 'death_record') RETURNING id INTO v_txn_id;
      RETURN NEXT v_txn_id;
    END IF;
  END LOOP;
  FOR v_existing IN SELECT dt.id, dt.member_id, dt.amount FROM public.dkp_transactions dt
    WHERE dt.reference_id = p_death_record_id AND dt.reference_type = 'death_record' AND dt.type = 'earn_kill'
    AND dt.member_id NOT IN (SELECT ar.member_id FROM public.attendance_records ar WHERE ar.death_record_id = p_death_record_id)
  LOOP
    -- Idempotency guard: skip if a reversal for this member/kill was already recorded.
    IF NOT EXISTS (
      SELECT 1 FROM public.dkp_transactions
      WHERE reference_id = p_death_record_id AND reference_type = 'death_record'
        AND member_id = v_existing.member_id AND type = 'earn_adjustment' AND reason = 'Removed from attendance'
    ) THEN
      INSERT INTO public.dkp_transactions (server_id, member_id, amount, type, reason, reference_id, reference_type)
      VALUES (v_server_id, v_existing.member_id, -v_existing.amount, 'earn_adjustment', 'Removed from attendance', p_death_record_id, 'death_record')
      RETURNING id INTO v_txn_id; RETURN NEXT v_txn_id;
    END IF;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.award_dkp_on_kill(UUID) TO authenticated;

-- One-time cleanup: collapse existing duplicate reversal rows down to one per
-- (reference_id, member_id), restoring the wrongly-deducted DKP to affected members.
DELETE FROM public.dkp_transactions dt
WHERE dt.type = 'earn_adjustment' AND dt.reason = 'Removed from attendance' AND dt.reference_type = 'death_record'
AND dt.id NOT IN (
  SELECT DISTINCT ON (reference_id, member_id) id
  FROM public.dkp_transactions
  WHERE type = 'earn_adjustment' AND reason = 'Removed from attendance' AND reference_type = 'death_record'
  ORDER BY reference_id, member_id, created_at ASC
);
