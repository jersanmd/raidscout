-- 20260626000000_fix_auto_kill_test_servers: Fix type mismatch in test server auto-kill function
--   Error: SQL STATE 22P02 — invalid input syntax for type integer
--   Cause: `picked` was declared as INT[] but members.id is UUID
--   Fix: Changed picked INT[] → picked UUID[]

CREATE OR REPLACE FUNCTION public.auto_kill_test_servers()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  srv RECORD;
  boss RECORD;
  last_death RECORD;
  kill_time TIMESTAMPTZ;
  death_id UUID;
  member_count INT;
  attendees INT;
  picked UUID[];
  total_kills INT := 0;
BEGIN
  FOR srv IN
    SELECT id, name FROM public.servers
    WHERE deleted_at IS NULL AND LOWER(name) LIKE '%test%'
  LOOP
    FOR boss IN
      SELECT id, name, spawn_type, respawn_hours, schedule
      FROM public.bosses
      WHERE server_id = srv.id AND is_enabled = true
    LOOP
      SELECT death_time INTO last_death
      FROM public.death_records
      WHERE boss_id = boss.id AND server_id = srv.id
        AND (is_initial_spawn IS NULL OR is_initial_spawn = false)
      ORDER BY death_time DESC LIMIT 1;

      IF boss.spawn_type = 'fixed_hours' THEN
        IF last_death.death_time IS NULL THEN
          kill_time := NOW() - (random() * boss.respawn_hours * 3600) * INTERVAL '1 second';
        ELSE
          kill_time := last_death.death_time + (boss.respawn_hours * 3600) * INTERVAL '1 second';
          IF kill_time > NOW() THEN CONTINUE; END IF;
          kill_time := kill_time + (random() * 7200) * INTERVAL '1 second';
          IF kill_time > NOW() THEN kill_time := NOW(); END IF;
        END IF;

      ELSIF boss.spawn_type = 'fixed_schedule' AND boss.schedule IS NOT NULL THEN
        kill_time := NULL;
        DECLARE
          slot JSONB;
          check_date DATE;
          slot_ts TIMESTAMPTZ;
        BEGIN
          FOR slot IN SELECT * FROM jsonb_array_elements(boss.schedule::jsonb) LOOP
            FOR d IN 0..6 LOOP
              check_date := (CURRENT_DATE - d)::DATE;
              IF EXTRACT(DOW FROM check_date) = (slot->>'day')::INT THEN
                slot_ts := (check_date || ' ' || (slot->>'time'))::TIMESTAMPTZ AT TIME ZONE 'UTC';
                IF slot_ts <= NOW() AND (kill_time IS NULL OR slot_ts > kill_time) THEN
                  kill_time := slot_ts;
                END IF;
              END IF;
            END LOOP;
          END LOOP;
        END;
        IF kill_time IS NULL THEN CONTINUE; END IF;
        IF last_death.death_time IS NOT NULL AND last_death.death_time >= kill_time THEN
          CONTINUE;
        END IF;
        kill_time := kill_time + (random() * 14400) * INTERVAL '1 second';
        IF kill_time > NOW() THEN kill_time := NOW(); END IF;
      ELSE
        CONTINUE;
      END IF;

      INSERT INTO public.death_records (boss_id, server_id, death_time)
      VALUES (boss.id, srv.id, kill_time)
      RETURNING id INTO death_id;

      SELECT COUNT(*) INTO member_count FROM public.members WHERE server_id = srv.id;
      IF member_count > 0 THEN
        attendees := GREATEST(1, FLOOR(member_count * (0.3 + random() * 0.5))::INT);
        picked := ARRAY(
          SELECT id FROM public.members WHERE server_id = srv.id ORDER BY random() LIMIT attendees
        );
        INSERT INTO public.attendance_records (death_record_id, member_id, server_id)
        SELECT death_id, id, srv.id FROM public.members
        WHERE id = ANY(picked) AND server_id = srv.id;
      END IF;

      total_kills := total_kills + 1;
    END LOOP;
  END LOOP;
  RETURN 'Killed ' || total_kills || ' bosses across test servers';
END;
$function$;
