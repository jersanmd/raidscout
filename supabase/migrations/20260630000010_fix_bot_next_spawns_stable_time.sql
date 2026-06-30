-- Fix: bot_next_spawns — return actual spawn time, not now()
-- When a boss is alive, v_spawn was being set to v_now, which changed every tick.
-- This broke the dedup key (which includes spawnUnix), causing notification spam.
-- Fix: keep the real spawn time, let is_alive flag indicate current state.
DROP FUNCTION IF EXISTS public.bot_next_spawns(uuid, text);

CREATE OR REPLACE FUNCTION public.bot_next_spawns(p_server_id uuid, p_tz text DEFAULT 'Asia/Manila')
RETURNS TABLE(boss_id uuid, boss_name text, spawn_type text, spawn_time timestamptz, is_alive boolean, guild_name text, respawn_hours int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := now();
  v_cutoff timestamptz := v_now + interval '24 hours';
  rec record; v_last_death timestamptz; v_override timestamptz; v_spawn timestamptz;
  v_recent timestamptz; v_next_slot timestamptz; v_alive_until timestamptz; v_was_killed boolean;
  v_diff int; slot record; check_day date; d int; slot_utc timestamptz;
BEGIN
  FOR rec IN
    SELECT b.*, COALESCE(b.respawn_hours, 0) AS rh FROM public.bosses b
    WHERE b.server_id = p_server_id AND b.is_enabled IS NOT FALSE AND b.deleted_at IS NULL AND b.spawn_type IN ('fixed_hours', 'fixed_schedule')
    ORDER BY b.name
  LOOP
    SELECT dr.death_time INTO v_last_death FROM public.death_records dr
    WHERE dr.boss_id = rec.id AND dr.server_id = p_server_id AND dr.is_initial_spawn IS NOT TRUE
    ORDER BY dr.death_time DESC LIMIT 1;

    SELECT bso.death_time INTO v_override FROM public.boss_spawn_overrides bso
    WHERE bso.boss_id = rec.id AND bso.server_id = p_server_id;

    IF rec.spawn_type = 'fixed_hours' THEN
      IF COALESCE(v_override, v_last_death) IS NOT NULL THEN
        v_spawn := COALESCE(v_override, v_last_death) + (rec.rh || ' hours')::interval;
        -- Keep real spawn time for stable dedup; is_alive flag handles "currently alive"
      ELSE
        -- Never killed, no override — boss is alive since server creation, use a stable epoch
        v_spawn := '2025-01-01 00:00:00+00'::timestamptz;
      END IF;

    ELSIF rec.spawn_type = 'fixed_schedule' AND rec.schedule IS NOT NULL THEN
      v_recent := NULL;
      FOR d IN 0..7 LOOP
        check_day := (v_now AT TIME ZONE p_tz)::date - d;
        FOR slot IN SELECT * FROM jsonb_to_recordset(rec.schedule) AS s(day int, "time" text) LOOP
          v_diff := slot.day - EXTRACT(DOW FROM check_day)::int;
          IF v_diff < -3 THEN v_diff := v_diff + 7; END IF;
          IF v_diff > 3 THEN v_diff := v_diff - 7; END IF;
          slot_utc := ((check_day + v_diff)::text || ' ' || slot."time")::timestamptz;
          IF slot_utc <= v_now AND (v_recent IS NULL OR slot_utc > v_recent) THEN v_recent := slot_utc; END IF;
        END LOOP;
      END LOOP;

      IF v_recent IS NOT NULL AND v_last_death IS NOT NULL THEN
        v_next_slot := NULL;
        FOR d IN 0..7 LOOP
          check_day := ((v_recent AT TIME ZONE p_tz)::date + (d + 1));
          FOR slot IN SELECT * FROM jsonb_to_recordset(rec.schedule) AS s(day int, "time" text) LOOP
            v_diff := slot.day - EXTRACT(DOW FROM check_day)::int;
            IF v_diff < -3 THEN v_diff := v_diff + 7; END IF;
            IF v_diff > 3 THEN v_diff := v_diff - 7; END IF;
            slot_utc := ((check_day + v_diff)::text || ' ' || slot."time")::timestamptz;
            IF slot_utc > v_recent AND (v_next_slot IS NULL OR slot_utc < v_next_slot) THEN v_next_slot := slot_utc; END IF;
          END LOOP;
          EXIT WHEN v_next_slot IS NOT NULL;
        END LOOP;

        IF v_next_slot IS NOT NULL THEN
          v_alive_until := LEAST(v_next_slot - interval '1 hour', v_recent + interval '4 hours');
          v_was_killed := v_last_death >= v_recent;
          IF NOT v_was_killed AND v_now >= v_recent AND v_now < v_alive_until THEN
            v_spawn := v_recent; -- Use actual window start, not v_now
          ELSE
            v_spawn := NULL;
            FOR d IN 0..7 LOOP
              check_day := (v_now AT TIME ZONE p_tz)::date + d;
              FOR slot IN SELECT * FROM jsonb_to_recordset(rec.schedule) AS s(day int, "time" text) LOOP
                v_diff := slot.day - EXTRACT(DOW FROM check_day)::int;
                IF v_diff < -3 THEN v_diff := v_diff + 7; END IF;
                IF v_diff > 3 THEN v_diff := v_diff - 7; END IF;
                slot_utc := ((check_day + v_diff)::text || ' ' || slot."time")::timestamptz;
                IF slot_utc > v_now AND (v_spawn IS NULL OR slot_utc < v_spawn) THEN v_spawn := slot_utc; END IF;
              END LOOP;
              EXIT WHEN v_spawn IS NOT NULL;
            END LOOP;
          END IF;
        ELSE v_spawn := NULL; END IF;
      ELSE
        v_spawn := NULL;
        FOR d IN 0..7 LOOP
          check_day := (v_now AT TIME ZONE p_tz)::date + d;
          FOR slot IN SELECT * FROM jsonb_to_recordset(rec.schedule) AS s(day int, "time" text) LOOP
            v_diff := slot.day - EXTRACT(DOW FROM check_day)::int;
            IF v_diff < -3 THEN v_diff := v_diff + 7; END IF;
            IF v_diff > 3 THEN v_diff := v_diff - 7; END IF;
            slot_utc := ((check_day + v_diff)::text || ' ' || slot."time")::timestamptz;
            IF slot_utc > v_now AND (v_spawn IS NULL OR slot_utc < v_spawn) THEN v_spawn := slot_utc; END IF;
          END LOOP;
          EXIT WHEN v_spawn IS NOT NULL;
        END LOOP;
      END IF;
    ELSE CONTINUE;
    END IF;

    IF v_spawn IS NOT NULL AND v_spawn <= v_cutoff THEN
      boss_id := rec.id; boss_name := rec.name; spawn_type := rec.spawn_type;
      spawn_time := v_spawn; is_alive := v_spawn <= v_now; guild_name := ''; respawn_hours := rec.rh;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bot_next_spawns(uuid, text) TO anon, authenticated;
