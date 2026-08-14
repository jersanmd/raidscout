-- Route late attendance into the finalized results it belongs to, not the current board.
--
-- 20260814000000 credited late attendance to the CURRENT period. That paid the
-- players but put the points in the wrong week: staff saw "Late attendance —
-- Shuliar Lvl 95, killed Aug 09 07:57 PM" sitting on the live board when the
-- guild's cutoff was Aug 10 01:22, and reasonably objected that a kill from the
-- finalized period should not score in the new one.
--
-- Confirmed against the data before changing anything: the snapshot never paid
-- these. Recomputing snapshot db8830fd (Jul 31 08:34 -> Aug 09 17:22) gives
-- gowlg 701 against a stored 629, Pakbet 657 against 569, Dusk 666 against 580 --
-- each gap exactly that member's late-attendance total. The attendance rows were
-- written Aug 14, five days after the snapshot was taken, so they could not have
-- been included. Dropping the credits outright would strand 2,253 points across
-- 60 members and re-create the original complaint.
--
-- So the points move into the snapshot whose period contains the kill. Ranks are
-- recomputed there; every member not touched keeps their published entry exactly.
--
-- The point_adjustments row is kept as a ledger -- it gives idempotency through
-- the unique index on attendance_record_id, and a record of what was added where.
-- Its created_at is backdated to the kill time so it falls inside the finalized
-- period and can never surface on the live board. Any recompute of that window
-- suppresses it anyway via the 20260814000001 guard, since the kill is in-window
-- and scoring on its own account -- so there is no path that counts it twice.
--
-- Un-checking attendance now withdraws the points from the snapshot too, via a
-- BEFORE DELETE trigger that fires while the ledger row is still present.

-- ── Snapshot patcher ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.apply_snapshot_point_delta(
  p_snapshot_id UUID,
  p_member_id   UUID,
  p_member_name TEXT,
  p_delta       INTEGER
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rankings JSONB;
  v_found    BOOLEAN;
BEGIN
  IF p_delta = 0 OR p_snapshot_id IS NULL THEN RETURN; END IF;

  SELECT ls.rankings INTO v_rankings
  FROM public.leaderboard_snapshots ls WHERE ls.id = p_snapshot_id FOR UPDATE;

  IF v_rankings IS NULL OR jsonb_typeof(v_rankings) <> 'array' THEN RETURN; END IF;

  -- Snapshots written by the frontend use memberId; backfilled ones use member_id.
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_rankings) e
    WHERE COALESCE(e->>'memberId', e->>'member_id') = p_member_id::text
  ) INTO v_found;

  IF v_found THEN
    SELECT jsonb_agg(
             CASE WHEN COALESCE(e->>'memberId', e->>'member_id') = p_member_id::text
                  THEN jsonb_set(e, '{points}',
                         to_jsonb(GREATEST(0, COALESCE((e->>'points')::int, 0) + p_delta)))
                  ELSE e END)
    INTO v_rankings
    FROM jsonb_array_elements(v_rankings) e;
  ELSIF p_delta > 0 THEN
    -- Member scored nothing in that period and was left out of the snapshot.
    v_rankings := v_rankings || jsonb_build_array(jsonb_build_object(
      'rank', 0,
      'memberId', p_member_id::text,
      'memberName', COALESCE(p_member_name, 'Unknown'),
      'points', p_delta));
  ELSE
    RETURN;
  END IF;

  -- Re-rank: points changed, so the published order has to follow.
  SELECT jsonb_agg(jsonb_set(e, '{rank}', to_jsonb(rn)) ORDER BY rn)
  INTO v_rankings
  FROM (
    SELECT e, row_number() OVER (
             ORDER BY COALESCE((e->>'points')::int, 0) DESC,
                      COALESCE(e->>'memberName', e->>'member_name', '')) AS rn
    FROM jsonb_array_elements(v_rankings) e
  ) t;

  UPDATE public.leaderboard_snapshots SET rankings = v_rankings WHERE id = p_snapshot_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_snapshot_point_delta(UUID, UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;

-- ── Which snapshot owns a given kill ─────────────────────────

CREATE OR REPLACE FUNCTION public.snapshot_covering_kill(
  p_server_id UUID, p_guild_name TEXT, p_death_time TIMESTAMPTZ
) RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ls.id
  FROM public.leaderboard_snapshots ls
  WHERE ls.server_id = p_server_id
    AND ls.period = 'weekly:' || p_guild_name
    AND p_death_time > COALESCE(ls.period_start, '-infinity'::timestamptz)
    AND p_death_time <= ls.finalized_at
  ORDER BY ls.finalized_at ASC
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.snapshot_covering_kill(UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;

-- ── INSERT: add the points to the covering snapshot ──────────

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
  v_member_name TEXT;
  v_points      NUMERIC;
  v_snapshot_id UUID;
  v_finalized   TIMESTAMPTZ;
BEGIN
  SELECT dr.death_time, dr.boss_id, COALESCE(NEW.server_id, dr.server_id)
  INTO v_death_time, v_boss_id, v_server_id
  FROM public.death_records dr WHERE dr.id = NEW.death_record_id;

  IF v_death_time IS NULL OR v_server_id IS NULL THEN RETURN NEW; END IF;

  SELECT m.guild_id, m.name INTO v_guild_id, v_member_name
  FROM public.members m WHERE m.id = NEW.member_id;
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

  -- No finalized period owns this kill -- nothing to amend, so nothing is granted.
  v_snapshot_id := public.snapshot_covering_kill(v_server_id, v_guild_name, v_death_time);
  IF v_snapshot_id IS NULL THEN RETURN NEW; END IF;
  SELECT ls.finalized_at INTO v_finalized
  FROM public.leaderboard_snapshots ls WHERE ls.id = v_snapshot_id;

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

  -- Ledger row. created_at is the kill time, so it sits inside the finalized
  -- period and never reaches the live board.
  INSERT INTO public.point_adjustments
    (member_id, server_id, points, reason, adjusted_by, attendance_record_id, created_at)
  VALUES (
    NEW.member_id, v_server_id, round(v_points)::int,
    'Late attendance — ' || COALESCE(v_boss_name, 'boss kill') || ', killed ' ||
      to_char(v_death_time AT TIME ZONE v_tz, 'Mon DD HH12:MI AM') ||
      ' (credited to the ' || to_char(v_finalized AT TIME ZONE v_tz, 'Mon DD') || ' results)',
    auth.uid(), NEW.id, v_death_time
  )
  ON CONFLICT (attendance_record_id) WHERE attendance_record_id IS NOT NULL DO NOTHING;

  IF NOT FOUND THEN RETURN NEW; END IF;   -- already credited; don't patch twice

  PERFORM public.apply_snapshot_point_delta(
    v_snapshot_id, NEW.member_id, v_member_name, round(v_points)::int);

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.credit_late_attendance() FROM PUBLIC, anon;

-- ── DELETE: take the points back out ─────────────────────────

CREATE OR REPLACE FUNCTION public.withdraw_late_attendance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_points      INTEGER;
  v_server_id   UUID;
  v_death_time  TIMESTAMPTZ;
  v_guild_name  TEXT;
  v_member_name TEXT;
  v_snapshot_id UUID;
BEGIN
  SELECT pa.points, pa.server_id INTO v_points, v_server_id
  FROM public.point_adjustments pa WHERE pa.attendance_record_id = OLD.id;

  IF v_points IS NULL THEN RETURN OLD; END IF;   -- not a late-attendance credit

  SELECT dr.death_time INTO v_death_time
  FROM public.death_records dr WHERE dr.id = OLD.death_record_id;

  SELECT g.name, m.name INTO v_guild_name, v_member_name
  FROM public.members m LEFT JOIN public.guilds g ON g.id = m.guild_id
  WHERE m.id = OLD.member_id;

  v_snapshot_id := public.snapshot_covering_kill(v_server_id, v_guild_name, v_death_time);
  IF v_snapshot_id IS NULL THEN RETURN OLD; END IF;

  PERFORM public.apply_snapshot_point_delta(
    v_snapshot_id, OLD.member_id, v_member_name, -v_points);

  RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.withdraw_late_attendance() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_withdraw_late_attendance ON public.attendance_records;
CREATE TRIGGER trg_withdraw_late_attendance
  BEFORE DELETE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.withdraw_late_attendance();

-- ── Move the credits already granted ─────────────────────────
--
-- 506 ledger rows / 2,253 points: SVEN 1 BIGASAN 409 rows (2,147 pts, 38 members),
-- Yvonne 6 PARAK 90 (90 pts, 16), Medea 4 - Divine 7 (16 pts, 6). Every one of
-- them falls inside exactly one snapshot, verified before running this.

-- Only ADDS the late-attendance points; it does not recompute the snapshot from
-- scratch. That matters for the two older ones: PARAK's and Divine's published
-- numbers have drifted from what a recompute now produces, in both directions
-- (Ellegee stored 60 vs 57 recomputed, Makisig 332 vs 379), from six weeks of
-- unrelated attendance and points edits. Adding only the delta leaves that history
-- alone. BIGASAN, finalized five days ago, lands exactly on its recompute for all
-- 38 members -- verified before running.
--
-- `pa.created_at <> dr.death_time` makes this re-runnable: the backdate below is
-- the marker for an already-migrated row.
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
    WHERE pa.created_at <> dr.death_time
    GROUP BY pa.member_id, m.name,
             public.snapshot_covering_kill(pa.server_id, g.name, dr.death_time)
  LOOP
    IF r.snapshot_id IS NOT NULL THEN
      PERFORM public.apply_snapshot_point_delta(
        r.snapshot_id, r.member_id, r.member_name, r.delta);
    END IF;
  END LOOP;
END $$;

-- Backdate the ledger to the kill time so these drop off the live board, and
-- restate the reason to say where the points actually went.
UPDATE public.point_adjustments pa
SET created_at = dr.death_time,
    reason = 'Late attendance — ' || COALESCE(b.name, 'boss kill') || ', killed ' ||
             to_char(dr.death_time AT TIME ZONE COALESCE(s.timezone, 'UTC'), 'Mon DD HH12:MI AM') ||
             ' (credited to the ' ||
             to_char(ls.finalized_at AT TIME ZONE COALESCE(s.timezone, 'UTC'), 'Mon DD') ||
             ' results)'
FROM public.attendance_records ar
JOIN public.death_records dr ON dr.id = ar.death_record_id
JOIN public.servers s ON s.id = dr.server_id
LEFT JOIN public.bosses b ON b.id = dr.boss_id
JOIN public.members m2 ON m2.id = ar.member_id
LEFT JOIN public.guilds g2 ON g2.id = m2.guild_id
JOIN public.leaderboard_snapshots ls
  ON ls.id = public.snapshot_covering_kill(dr.server_id, g2.name, dr.death_time)
WHERE pa.attendance_record_id = ar.id;
