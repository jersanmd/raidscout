-- Put late attendance back on the current week's board, and restore the published
-- Aug 9 results.
--
-- 20260814000003 moved late-attendance points into the snapshot whose period
-- contained the kill. That is defensible on accounting grounds, but it rewrites
-- results the guild has already seen and announced -- gowlg's Aug 9 total moved
-- 629 -> 716. The call is that published results stay frozen and the points show
-- up on the current week instead, which is where staff will look for them.
--
-- This reverts to the 20260814000000 behaviour:
--   * snapshots go back to exactly their published numbers
--   * the ledger row's created_at returns to "now", so it scores this period
--   * un-checking attendance withdraws the credit through the existing FK cascade,
--     so the BEFORE DELETE trigger is dropped
--
-- The 20260814000001 suppression guard stays and is still doing work: it keeps a
-- credit from double-counting alongside its own kill whenever a window contains
-- both -- which is exactly what a snapshot recompute does.
--
-- Trade-off being accepted deliberately: a kill from last week checked in today
-- scores on this week's board. Period attribution is inexact; published results
-- are stable.

-- ── Restore the snapshots ────────────────────────────────────
--
-- Subtracts exactly what 20260814000003 added, then re-ranks. `created_at =
-- death_time` is the marker for a row still in the snapshot-routed state, which
-- makes this re-runnable.
--
-- Entries that fall back to 0 are kept rather than deleted. Eliazz was in the
-- BIGASAN snapshot at 0 before any of this (entry count was 51 before and after),
-- so removing zero-point rows wholesale would drop a legitimate published entry.
-- The cost is two extra zero-point rows at the bottom of PARAK's Jul 12 snapshot
-- for DarKaNgeL21 and ZeemoCZ, who were appended when their points were added.

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT pa.member_id, m.name AS member_name,
           public.snapshot_covering_kill(pa.server_id, g.name, dr.death_time) AS snapshot_id,
           SUM(pa.points)::int AS delta
    FROM public.point_adjustments pa
    JOIN public.attendance_records ar ON ar.id = pa.attendance_record_id
    JOIN public.death_records dr ON dr.id = ar.death_record_id
    JOIN public.members m ON m.id = pa.member_id
    LEFT JOIN public.guilds g ON g.id = m.guild_id
    WHERE pa.created_at = dr.death_time
    GROUP BY pa.member_id, m.name,
             public.snapshot_covering_kill(pa.server_id, g.name, dr.death_time)
  LOOP
    IF r.snapshot_id IS NOT NULL THEN
      PERFORM public.apply_snapshot_point_delta(
        r.snapshot_id, r.member_id, r.member_name, -r.delta);
    END IF;
  END LOOP;
END $$;

-- ── Move the ledger back onto the current period ─────────────

UPDATE public.point_adjustments pa
SET created_at = now(),
    reason = 'Late attendance — ' || COALESCE(b.name, 'boss kill') || ', killed ' ||
             to_char(dr.death_time AT TIME ZONE COALESCE(s.timezone, 'UTC'), 'Mon DD HH12:MI AM')
FROM public.attendance_records ar
JOIN public.death_records dr ON dr.id = ar.death_record_id
JOIN public.servers s ON s.id = dr.server_id
LEFT JOIN public.bosses b ON b.id = dr.boss_id
WHERE pa.attendance_record_id = ar.id
  AND pa.created_at = dr.death_time;

-- ── Trigger: credit the current period again ─────────────────

CREATE OR REPLACE FUNCTION public.credit_late_attendance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_server_id   UUID;
  v_tz          TEXT;
  v_server_created_at TIMESTAMPTZ;
  v_cutoff      TIMESTAMPTZ;
  v_death_time  TIMESTAMPTZ;
  v_boss_id     UUID;
  v_boss_name   TEXT;
  v_guild_id    UUID;
  v_guild_name  TEXT;
  v_points      NUMERIC;
BEGIN
  SELECT dr.death_time, dr.boss_id, COALESCE(NEW.server_id, dr.server_id)
  INTO v_death_time, v_boss_id, v_server_id
  FROM public.death_records dr WHERE dr.id = NEW.death_record_id;

  IF v_death_time IS NULL OR v_server_id IS NULL THEN RETURN NEW; END IF;

  SELECT m.guild_id INTO v_guild_id FROM public.members m WHERE m.id = NEW.member_id;
  SELECT g.name INTO v_guild_name FROM public.guilds g WHERE g.id = v_guild_id;

  SELECT COALESCE(s.timezone, 'UTC'), s.created_at
  INTO v_tz, v_server_created_at
  FROM public.servers s WHERE s.id = v_server_id;

  SELECT COALESCE(
    (SELECT a.value::timestamptz FROM public.app_settings a
      WHERE a.server_id = v_server_id
        AND a.key = 'leaderboard_reset_at:' || v_guild_name),
    v_server_created_at
  ) INTO v_cutoff;

  -- Not late: the kill is inside the open period and already scores normally.
  IF v_cutoff IS NULL OR v_death_time >= v_cutoff THEN RETURN NEW; END IF;

  SELECT
    COALESCE(bg.points, b.boss_points, 0) * COALESCE((
      SELECT MAX((pr.config->>'multiplier')::numeric) FROM public.point_rules pr
      WHERE pr.guild_id = v_guild_id AND pr.rule_type = 'time_multiplier' AND pr.enabled = true
        AND (((pr.config->>'start_hour')::int <= (pr.config->>'end_hour')::int
              AND EXTRACT(HOUR FROM v_death_time AT TIME ZONE v_tz) >= (pr.config->>'start_hour')::int
              AND EXTRACT(HOUR FROM v_death_time AT TIME ZONE v_tz) <  (pr.config->>'end_hour')::int)
          OR ((pr.config->>'start_hour')::int > (pr.config->>'end_hour')::int
              AND (EXTRACT(HOUR FROM v_death_time AT TIME ZONE v_tz) >= (pr.config->>'start_hour')::int
                OR EXTRACT(HOUR FROM v_death_time AT TIME ZONE v_tz) <  (pr.config->>'end_hour')::int)))
    ), 1),
    b.name
  INTO v_points, v_boss_name
  FROM public.bosses b
  LEFT JOIN (
    SELECT DISTINCT ON (boss_id, guild_id) boss_id, guild_id, points
    FROM public.boss_guilds WHERE points IS NOT NULL
    ORDER BY boss_id, guild_id, points DESC
  ) bg ON bg.boss_id = b.id AND bg.guild_id = v_guild_id
  WHERE b.id = v_boss_id;

  IF v_points IS NULL OR round(v_points) = 0 THEN RETURN NEW; END IF;

  -- created_at defaults to now(), so the credit lands on the current period.
  INSERT INTO public.point_adjustments
    (member_id, server_id, points, reason, adjusted_by, attendance_record_id)
  VALUES (
    NEW.member_id, v_server_id, round(v_points)::int,
    'Late attendance — ' || COALESCE(v_boss_name, 'boss kill') || ', killed ' ||
      to_char(v_death_time AT TIME ZONE v_tz, 'Mon DD HH12:MI AM'),
    auth.uid(), NEW.id
  )
  ON CONFLICT (attendance_record_id) WHERE attendance_record_id IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.credit_late_attendance() FROM PUBLIC, anon;

-- Withdrawal is back to the FK cascade on point_adjustments.attendance_record_id.
DROP TRIGGER IF EXISTS trg_withdraw_late_attendance ON public.attendance_records;
DROP FUNCTION IF EXISTS public.withdraw_late_attendance();
