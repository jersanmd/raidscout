-- Make it obvious which date a late-attendance credit is showing.
--
-- The label read "Late attendance — Shuliar Lvl 95 on Aug 09, 07:57 PM", which
-- reads as if the credit itself were dated Aug 09 -- before the guild's Aug 10
-- 01:22 cutoff, and therefore wrong. It isn't: that timestamp is when the BOSS
-- was killed, and it is necessarily before the cutoff, because a kill after the
-- cutoff already scores normally and never needs a credit. The credit's own date
-- (what actually places it in the current period) is the created_at the UI prints
-- beside it.
--
-- "killed <date>" instead of "on <date>" names which timestamp is being shown.
-- The comma after DD is dropped since the boss name now ends with one.
--
-- Everything else is unchanged from 20260814000000.

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

-- Relabel the 411 backfilled credits. Regenerated from the linked attendance row
-- rather than string-edited, so the text cannot drift from the underlying kill.
-- attendance_record_id IS NOT NULL is the authoritative marker for a system-minted
-- credit; manual staff adjustments are never touched.
UPDATE public.point_adjustments pa
SET reason = 'Late attendance — ' || COALESCE(b.name, 'boss kill') || ', killed ' ||
             to_char(dr.death_time AT TIME ZONE COALESCE(s.timezone, 'UTC'), 'Mon DD HH12:MI AM')
FROM public.attendance_records ar
JOIN public.death_records dr ON dr.id = ar.death_record_id
JOIN public.servers s ON s.id = dr.server_id
LEFT JOIN public.bosses b ON b.id = dr.boss_id
WHERE pa.attendance_record_id = ar.id;
