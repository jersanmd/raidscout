-- 104: Allow deleting leaderboard snapshots (for unfinalize)
-- 1. Add DELETE RLS policy
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can delete snapshots' AND tablename = 'leaderboard_snapshots') THEN
    CREATE POLICY "Authenticated users can delete snapshots"
      ON public.leaderboard_snapshots FOR DELETE
      TO authenticated
      USING (true);
  END IF;
END $$;

-- 2. SECURITY DEFINER RPC to delete snapshot + restore reset date (bypasses RLS issues)
CREATE OR REPLACE FUNCTION public.delete_leaderboard_snapshot(
  p_snapshot_id UUID,
  p_server_id UUID,
  p_period TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reset_key TEXT;
  v_prev_reset TIMESTAMPTZ;
  v_snap_finalized TIMESTAMPTZ;
BEGIN
  -- Get the snapshot's finalized_at
  SELECT finalized_at INTO v_snap_finalized
  FROM public.leaderboard_snapshots
  WHERE id = p_snapshot_id;

  IF NOT FOUND THEN RETURN; END IF;

  -- Determine the reset key
  v_reset_key := CASE WHEN p_period LIKE 'weekly:%' 
    THEN 'leaderboard_reset_at:' || replace(p_period, 'weekly:', '')
    ELSE 'leaderboard_reset_at'
  END;

  -- Find the previous snapshot's finalized_at to restore
  SELECT finalized_at INTO v_prev_reset
  FROM public.leaderboard_snapshots
  WHERE server_id = p_server_id
    AND period = p_period
    AND finalized_at < v_snap_finalized
  ORDER BY finalized_at DESC
  LIMIT 1;

  -- Delete the snapshot
  DELETE FROM public.leaderboard_snapshots WHERE id = p_snapshot_id;

  -- Restore previous reset date (or remove if none)
  IF v_prev_reset IS NOT NULL THEN
    INSERT INTO public.app_settings (key, value, server_id)
    VALUES (v_reset_key, v_prev_reset::text, p_server_id)
    ON CONFLICT (key, server_id) DO UPDATE SET value = EXCLUDED.value;
  ELSE
    DELETE FROM public.app_settings WHERE key = v_reset_key AND server_id = p_server_id;
  END IF;
END;
$$;
