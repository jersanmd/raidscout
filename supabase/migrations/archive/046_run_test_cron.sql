-- run_test_cron: Simulates live boss kills for test servers.
-- Each call checks which bosses are currently alive and "kills" them with a random guild + participants.

CREATE OR REPLACE FUNCTION run_test_cron()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  srv record;
  boss record;
  last_death timestamptz;
  spawn_time timestamptz;
  kill_time timestamptz;
  death_id uuid;
  member record;
  guild_ids uuid[];
  picked_guild_id uuid;
  total_kills int := 0;
BEGIN
  -- For each server with "test" in the name (case insensitive)
  FOR srv IN
    SELECT id, name FROM public.servers
    WHERE deleted_at IS NULL AND lower(name) LIKE '%test%'
  LOOP
    -- Get server's guilds
    guild_ids := ARRAY(
      SELECT id FROM public.guilds WHERE server_id = srv.id ORDER BY name
    );

    -- For each enabled fixed_hours boss
    FOR boss IN
      SELECT * FROM public.bosses
      WHERE server_id = srv.id AND is_enabled = true AND deleted_at IS NULL AND spawn_type = 'fixed_hours'
    LOOP
      -- Find the most recent death
      SELECT death_time INTO last_death
      FROM public.death_records
      WHERE boss_id = boss.id AND server_id = srv.id
      ORDER BY death_time DESC LIMIT 1;

      -- Calculate spawn time
      IF last_death IS NOT NULL THEN
        spawn_time := last_death + (COALESCE(boss.respawn_hours, 24) || ' hours')::interval;
      ELSE
        -- No deaths yet: boss is alive from the beginning
        spawn_time := now() - (COALESCE(boss.respawn_hours, 24) || ' hours')::interval;
      END IF;

      -- If boss is currently alive (spawn_time is in the past), simulate a kill
      IF spawn_time <= now() THEN
        -- Kill happened sometime between spawn and now
        kill_time := spawn_time + (random() * extract(epoch from (now() - spawn_time)) || ' seconds')::interval;
        IF kill_time > now() THEN kill_time := now(); END IF;

        -- Pick a random guild
        IF array_length(guild_ids, 1) > 0 THEN
          picked_guild_id := guild_ids[1 + floor(random() * array_length(guild_ids, 1))];
          INSERT INTO public.death_records (boss_id, server_id, death_time, owner_guild_id)
          VALUES (boss.id, srv.id, kill_time, picked_guild_id)
          RETURNING id INTO death_id;
        ELSE
          INSERT INTO public.death_records (boss_id, server_id, death_time)
          VALUES (boss.id, srv.id, kill_time)
          RETURNING id INTO death_id;
        END IF;

        -- Add 3-8 random attendance records
        FOR member IN
          SELECT id FROM public.members WHERE server_id = srv.id
          ORDER BY random() LIMIT (3 + floor(random() * 6))
        LOOP
          INSERT INTO public.attendance_records (death_record_id, member_id, server_id)
          VALUES (death_id, member.id, srv.id)
          ON CONFLICT (death_record_id, member_id) DO NOTHING;
        END LOOP;

        -- Advance rotation counter
        UPDATE public.bosses
        SET rotation_counter = COALESCE(rotation_counter, 0) + 1
        WHERE id = boss.id;

        total_kills := total_kills + 1;
      END IF;
    END LOOP;
  END LOOP;

  IF total_kills = 0 THEN
    RETURN 'No bosses currently alive to kill';
  END IF;
  RETURN 'Simulated ' || total_kills || ' kills';
END;
$$;

GRANT EXECUTE ON FUNCTION run_test_cron() TO authenticated, service_role;

-- ── Status tracking ────────────────────────────────────────
-- Tracks last run time so the admin panel can show "Active" status

CREATE TABLE IF NOT EXISTS public.test_cron_status (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_run timestamptz,
  active boolean DEFAULT true
);

-- Ensure there's always a row
INSERT INTO public.test_cron_status (id, last_run, active)
VALUES (1, null, true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.test_cron_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read test_cron_status" ON public.test_cron_status FOR SELECT USING (auth.role() = 'authenticated');

-- ── Status function (called by admin panel) ─────────────────

DROP FUNCTION IF EXISTS get_cron_test_status();

CREATE OR REPLACE FUNCTION get_cron_test_status()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  status_row record;
  result json;
BEGIN
  SELECT last_run, active INTO status_row FROM public.test_cron_status WHERE id = 1;

  SELECT json_build_object(
    'active', COALESCE(status_row.active, false),
    'last_run', COALESCE(to_char(status_row.last_run AT TIME ZONE 'Asia/Manila', 'Mon DD, YYYY HH24:MI:SS'), 'Never'),
    'servers', COALESCE((
      SELECT json_agg(srv) FROM (
        SELECT s.name, COUNT(dr.id)::int as kills
        FROM public.servers s
        LEFT JOIN public.death_records dr ON dr.server_id = s.id
        WHERE s.deleted_at IS NULL AND lower(s.name) LIKE '%test%'
        GROUP BY s.id, s.name
        ORDER BY kills DESC
      ) srv
    ), '[]'::json),
    'total_kills', COALESCE((
      SELECT COUNT(*)::int FROM public.death_records dr
      JOIN public.servers s ON s.id = dr.server_id
      WHERE s.deleted_at IS NULL AND lower(s.name) LIKE '%test%'
    ), 0)
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_cron_test_status() TO authenticated, service_role;

-- ── Update run_test_cron to track status ────────────────────

CREATE OR REPLACE FUNCTION run_test_cron()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  srv record;
  boss record;
  last_death timestamptz;
  spawn_time timestamptz;
  kill_time timestamptz;
  death_id uuid;
  member record;
  guild_ids uuid[];
  picked_guild_id uuid;
  total_kills int := 0;
BEGIN
  -- Mark as running
  UPDATE public.test_cron_status SET last_run = now(), active = true WHERE id = 1;

  FOR srv IN
    SELECT id, name FROM public.servers
    WHERE deleted_at IS NULL AND lower(name) LIKE '%test%'
  LOOP
    guild_ids := ARRAY(
      SELECT id FROM public.guilds WHERE server_id = srv.id ORDER BY name
    );

    FOR boss IN
      SELECT * FROM public.bosses
      WHERE server_id = srv.id AND is_enabled = true AND deleted_at IS NULL AND spawn_type = 'fixed_hours'
    LOOP
      SELECT death_time INTO last_death
      FROM public.death_records
      WHERE boss_id = boss.id AND server_id = srv.id
      ORDER BY death_time DESC LIMIT 1;

      IF last_death IS NOT NULL THEN
        spawn_time := last_death + (COALESCE(boss.respawn_hours, 24) || ' hours')::interval;
      ELSE
        spawn_time := now() - (COALESCE(boss.respawn_hours, 24) || ' hours')::interval;
      END IF;

      IF spawn_time <= now() THEN
        kill_time := spawn_time + (random() * extract(epoch from (now() - spawn_time)) || ' seconds')::interval;
        IF kill_time > now() THEN kill_time := now(); END IF;

        IF array_length(guild_ids, 1) > 0 THEN
          picked_guild_id := guild_ids[1 + floor(random() * array_length(guild_ids, 1))];
          INSERT INTO public.death_records (boss_id, server_id, death_time, owner_guild_id)
          VALUES (boss.id, srv.id, kill_time, picked_guild_id)
          RETURNING id INTO death_id;
        ELSE
          INSERT INTO public.death_records (boss_id, server_id, death_time)
          VALUES (boss.id, srv.id, kill_time)
          RETURNING id INTO death_id;
        END IF;

        FOR member IN
          SELECT id FROM public.members WHERE server_id = srv.id
          ORDER BY random() LIMIT (3 + floor(random() * 6))
        LOOP
          INSERT INTO public.attendance_records (death_record_id, member_id, server_id)
          VALUES (death_id, member.id, srv.id)
          ON CONFLICT (death_record_id, member_id) DO NOTHING;
        END LOOP;

        UPDATE public.bosses
        SET rotation_counter = COALESCE(rotation_counter, 0) + 1
        WHERE id = boss.id;

        total_kills := total_kills + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN 'Simulated ' || total_kills || ' kills';
END;
$$;

-- ── pg_cron job: run every 5 minutes ────────────────────────
-- NOTE: Requires pg_cron extension enabled in Supabase dashboard
SELECT cron.schedule(
  'test-cron-simulate',
  '*/5 * * * *',
  'SELECT run_test_cron();'
) WHERE EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron');

-- ── Enable Realtime for live updates ────────────────────────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.test_cron_status;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.death_records;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_records;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.bosses;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.servers;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.boss_spawn_overrides;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.members;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.guilds;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.boss_guilds;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
