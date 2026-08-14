-- Credit late attendance to the current period.
--
-- Problem: since 20260808000000 the leaderboard filters boss points by
-- death_records.death_time rather than attendance_records.created_at. That
-- correctly stops a re-matched attendance row on an already-paid kill from
-- inflating the live board (the 629-vs-571 bug), but it also means attendance
-- entered AFTER a guild finalizes, for a kill that happened BEFORE the cutoff,
-- is credited nowhere at all:
--
--   * not on the live board -- the kill is outside the current window
--   * not in the snapshot   -- that was taken before the row existed
--
-- Staff on SVEN 1 hit this on 2026-08-14: 314 check-ins across 36 members and
-- 18 kills, all for kills between Aug 08 00:56 and Aug 09 13:03, against a
-- BIGASAN cutoff of Aug 09 17:22. DKP moved (317 earn_kill transactions) but
-- leaderboard points did not, which is how it surfaced -- their workflow marks
-- attendance in batches days after the kill, but finalize snapshots immediately.
--
-- Fix: when attendance is added for a kill older than that guild's reset, mint a
-- point_adjustment in the CURRENT period worth exactly what the kill would have
-- scored. The player gets the points, the live board moves, and the published
-- snapshot is never rewritten.
--
-- The adjustment is linked back to the attendance row it compensates for:
--   * ON DELETE CASCADE, so un-checking attendance withdraws the credit -- no
--     delete trigger needed, and no way to leave an orphaned adjustment behind.
--   * a unique index, so re-adding the same attendance can never double-credit.
--     (The staff path upserts on (death_record_id, member_id), which fires an
--     UPDATE rather than an INSERT, but the viewer RPC and the bulk-copy path
--     both plain-INSERT -- hence a trigger rather than patching three call sites.)
--
-- 20260814000001 handles the reverse direction: delete_leaderboard_snapshot moves
-- the reset BACKWARD, which would bring the original kill back into the window
-- and double-count it alongside this adjustment.

-- ── Link column ──────────────────────────────────────────────

ALTER TABLE public.point_adjustments
  ADD COLUMN IF NOT EXISTS attendance_record_id UUID
  REFERENCES public.attendance_records(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS point_adjustments_attendance_record_id_key
  ON public.point_adjustments (attendance_record_id)
  WHERE attendance_record_id IS NOT NULL;

-- These credits are minted by the system, not by a person. The viewer path has no
-- auth.uid() at all, so the column cannot stay NOT NULL.
ALTER TABLE public.point_adjustments ALTER COLUMN adjusted_by DROP NOT NULL;

-- ── Trigger ──────────────────────────────────────────────────

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

  -- Same cutoff chain get_leaderboard uses for the live "Since Reset" board
  -- (p_since is NULL there): the guild's reset, else the server's creation.
  SELECT COALESCE(
    (SELECT a.value::timestamptz FROM public.app_settings a
      WHERE a.server_id = v_server_id
        AND a.key = 'leaderboard_reset_at:' || v_guild_name),
    v_server_created_at
  ) INTO v_cutoff;

  -- Not late: the kill is inside the open period and already scores normally.
  IF v_cutoff IS NULL OR v_death_time >= v_cutoff THEN RETURN NEW; END IF;

  -- Point value, mirroring get_leaderboard's boss_scores CTE exactly:
  -- per-guild override, else the boss default, times any enabled time multiplier
  -- evaluated in the server's timezone.
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

  -- point_adjustments.points is integer. Every multiplier in production is a whole
  -- number today, so this rounds nothing; it only guards a future fractional rule.
  IF v_points IS NULL OR round(v_points) = 0 THEN RETURN NEW; END IF;

  INSERT INTO public.point_adjustments
    (member_id, server_id, points, reason, adjusted_by, attendance_record_id)
  VALUES (
    NEW.member_id, v_server_id, round(v_points)::int,
    'Late attendance — ' || COALESCE(v_boss_name, 'boss kill') || ' on ' ||
      to_char(v_death_time AT TIME ZONE v_tz, 'Mon DD, HH12:MI AM'),
    auth.uid(), NEW.id
  )
  ON CONFLICT (attendance_record_id) WHERE attendance_record_id IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_credit_late_attendance ON public.attendance_records;
CREATE TRIGGER trg_credit_late_attendance
  AFTER INSERT ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.credit_late_attendance();

-- ── Show system-minted credits as "System" rather than "Unknown" ──

CREATE OR REPLACE FUNCTION public.fetch_point_adjustments(p_server_id UUID, p_member_id UUID DEFAULT NULL)
RETURNS TABLE(id UUID, member_id UUID, member_name TEXT, points INTEGER, reason TEXT,
              adjusted_by_name TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    pa.id,
    pa.member_id,
    m.name AS member_name,
    pa.points,
    pa.reason,
    CASE WHEN pa.adjusted_by IS NULL AND pa.attendance_record_id IS NOT NULL THEN 'System'
         ELSE COALESCE(ur.raw_user_meta_data->>'name', ur.email, 'Unknown') END AS adjusted_by_name,
    pa.created_at
  FROM public.point_adjustments pa
  JOIN public.members m ON m.id = pa.member_id
  LEFT JOIN auth.users ur ON ur.id = pa.adjusted_by
  WHERE pa.server_id = p_server_id
    AND (p_member_id IS NULL OR pa.member_id = p_member_id)
  ORDER BY pa.created_at DESC;
$$;

-- ── Backfill ─────────────────────────────────────────────────
--
-- 411 attendance rows across three guilds, all entered after their guild's most
-- recent reset for kills that predate it: SVEN 1/BIGASAN 314, Yvonne 6/PARAK 90,
-- Medea 4 - Divine/Divine 7. None of these guilds has finalized since, so the
-- open period they land in is the one those points were always meant for.
--
-- Every row is credited at now(), so it clears each guild's cutoff.

INSERT INTO public.point_adjustments
  (member_id, server_id, points, reason, adjusted_by, attendance_record_id)
SELECT
  ar.member_id,
  m.server_id,
  round(
    COALESCE(bg.points, b.boss_points, 0) * COALESCE((
      SELECT MAX((pr.config->>'multiplier')::numeric) FROM public.point_rules pr
      WHERE pr.guild_id = m.guild_id AND pr.rule_type = 'time_multiplier' AND pr.enabled = true
        AND (((pr.config->>'start_hour')::int <= (pr.config->>'end_hour')::int
              AND EXTRACT(HOUR FROM dr.death_time AT TIME ZONE COALESCE(s.timezone, 'UTC')) >= (pr.config->>'start_hour')::int
              AND EXTRACT(HOUR FROM dr.death_time AT TIME ZONE COALESCE(s.timezone, 'UTC')) <  (pr.config->>'end_hour')::int)
          OR ((pr.config->>'start_hour')::int > (pr.config->>'end_hour')::int
              AND (EXTRACT(HOUR FROM dr.death_time AT TIME ZONE COALESCE(s.timezone, 'UTC')) >= (pr.config->>'start_hour')::int
                OR EXTRACT(HOUR FROM dr.death_time AT TIME ZONE COALESCE(s.timezone, 'UTC')) <  (pr.config->>'end_hour')::int)))
    ), 1)
  )::int AS points,
  'Late attendance — ' || COALESCE(b.name, 'boss kill') || ' on ' ||
    to_char(dr.death_time AT TIME ZONE COALESCE(s.timezone, 'UTC'), 'Mon DD, HH12:MI AM'),
  NULL,
  ar.id
FROM public.attendance_records ar
JOIN public.death_records dr ON dr.id = ar.death_record_id
JOIN public.members m ON m.id = ar.member_id
JOIN public.servers s ON s.id = m.server_id
JOIN public.guilds g ON g.id = m.guild_id
JOIN public.app_settings a
  ON a.server_id = m.server_id AND a.key = 'leaderboard_reset_at:' || g.name
LEFT JOIN public.bosses b ON b.id = dr.boss_id
LEFT JOIN (
  SELECT DISTINCT ON (boss_id, guild_id) boss_id, guild_id, points
  FROM public.boss_guilds WHERE points IS NOT NULL
  ORDER BY boss_id, guild_id, points DESC
) bg ON bg.boss_id = b.id AND bg.guild_id = m.guild_id
WHERE ar.created_at > (a.value)::timestamptz
  AND dr.death_time  < (a.value)::timestamptz
  AND round(COALESCE(bg.points, b.boss_points, 0)) <> 0
ON CONFLICT (attendance_record_id) WHERE attendance_record_id IS NOT NULL DO NOTHING;
