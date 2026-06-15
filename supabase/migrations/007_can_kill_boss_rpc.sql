-- RPC: Check if a boss/activity is currently killable.
-- Used by the Discord bot's !kill command to match website behavior.
-- Mirrors src/lib/spawnCalculator.ts logic on the database side.

CREATE OR REPLACE FUNCTION public.can_kill_boss(
  p_server_id UUID,
  p_boss_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_boss RECORD;
  v_latest RECORD;
  v_now TIMESTAMPTZ := now();
  v_timezone TEXT;
  v_server_now TIMESTAMPTZ;
  v_next_spawn TIMESTAMPTZ;
  v_alive_until TIMESTAMPTZ;
  v_slot_day INT;
  v_slot_time TEXT;
  v_slot_mins INT;
  v_current_day INT;
  v_current_mins INT;
  v_best_day INT := -1;
  v_best_mins INT := -1;
  v_best_time TEXT;
  v_slot_entry JSONB;
  v_slot_ts TIMESTAMPTZ;
  v_raw_alive TIMESTAMPTZ;
  v_respawn_hours INT;
BEGIN
  -- Get server timezone
  SELECT s.timezone INTO v_timezone FROM public.servers s WHERE s.id = p_server_id;
  v_server_now := v_now AT TIME ZONE COALESCE(v_timezone, 'UTC');

  -- Get boss info
  SELECT * INTO v_boss FROM public.bosses
  WHERE id = p_boss_id AND server_id = p_server_id;

  IF v_boss IS NULL THEN
    RETURN jsonb_build_object('can_kill', false, 'reason', 'Boss not found');
  END IF;

  -- Get latest death
  SELECT death_time INTO v_latest FROM public.death_records
  WHERE boss_id = p_boss_id AND server_id = p_server_id
  ORDER BY death_time DESC LIMIT 1;

  -- One-time boss: completed if already killed
  IF v_boss.is_recurring = false AND v_latest.death_time IS NOT NULL THEN
    RETURN jsonb_build_object('can_kill', false, 'reason', 'Already completed (one-time)');
  END IF;

  -- ── Fixed Hours ──
  IF v_boss.spawn_type = 'fixed_hours' THEN
    IF v_boss.respawn_hours IS NULL THEN
      RETURN jsonb_build_object('can_kill', false, 'reason', 'No respawn hours configured');
    END IF;

    IF v_latest.death_time IS NULL THEN
      -- No death yet: check utc_start from schedule
      IF v_boss.schedule IS NOT NULL AND jsonb_typeof(v_boss.schedule) = 'object' AND v_boss.schedule ? 'utc_start' THEN
        v_next_spawn := (v_boss.schedule->>'utc_start')::TIMESTAMPTZ;
        IF v_now >= v_next_spawn THEN
          RETURN jsonb_build_object('can_kill', true, 'boss_name', v_boss.name);
        END IF;
      END IF;
      RETURN jsonb_build_object('can_kill', false, 'reason', 'Not yet spawned (no death record)');
    END IF;

    v_next_spawn := v_latest.death_time + (v_boss.respawn_hours || ' hours')::INTERVAL;
    IF v_now >= v_next_spawn THEN
      RETURN jsonb_build_object('can_kill', true, 'boss_name', v_boss.name);
    END IF;

    RETURN jsonb_build_object('can_kill', false, 'reason', 'Still on cooldown',
      'next_spawn', to_char(v_next_spawn, 'YYYY-MM-DD HH24:MI:SS TZ'));
  END IF;

  -- ── Fixed Schedule ──
  IF v_boss.spawn_type = 'fixed_schedule' THEN
    IF v_boss.schedule IS NULL OR jsonb_array_length(v_boss.schedule) = 0 THEN
      RETURN jsonb_build_object('can_kill', false, 'reason', 'No schedule configured');
    END IF;

    -- Get current day & time in server timezone
    v_current_day := extract(DOW FROM v_server_now)::INT; -- 0=Sun
    v_current_mins := extract(HOUR FROM v_server_now)::INT * 60 + extract(MINUTE FROM v_server_now)::INT;

    -- Find the most recent schedule slot
    FOR v_slot_entry IN SELECT * FROM jsonb_array_elements(v_boss.schedule)
    LOOP
      v_slot_day := (v_slot_entry->>'day')::INT;
      v_slot_time := v_slot_entry->>'time';
      v_slot_mins := (split_part(v_slot_time, ':', 1)::INT * 60 + split_part(v_slot_time, ':', 2)::INT);

      -- Slot is "past" if earlier today or on a previous day this week
      IF (v_slot_day = v_current_day AND v_slot_mins <= v_current_mins)
         OR (v_slot_day < v_current_day) THEN
        IF v_slot_day > v_best_day OR (v_slot_day = v_best_day AND v_slot_mins > v_best_mins) THEN
          v_best_day := v_slot_day;
          v_best_mins := v_slot_mins;
          v_best_time := v_slot_time;
        END IF;
      END IF;
    END LOOP;

    -- If no past slot today, check last slot of previous week
    IF v_best_day = -1 THEN
      FOR v_slot_entry IN SELECT * FROM jsonb_array_elements(v_boss.schedule)
      LOOP
        v_slot_day := (v_slot_entry->>'day')::INT;
        v_slot_mins := (split_part(v_slot_entry->>'time', ':', 1)::INT * 60 + split_part(v_slot_entry->>'time', ':', 2)::INT);
        IF (v_slot_day * 1440 + v_slot_mins) > (v_best_day * 1440 + v_best_mins) THEN
          v_best_day := v_slot_day;
          v_best_mins := v_slot_mins;
          v_best_time := v_slot_entry->>'time';
        END IF;
      END LOOP;

      -- Build timestamp for last week's slot
      v_slot_ts := date_trunc('day', v_server_now)
        + ((v_current_day - v_best_day + 7) % 7 || ' days')::INTERVAL * -1
        + (split_part(v_best_time, ':', 1)::INT || ' hours')::INTERVAL
        + (split_part(v_best_time, ':', 2)::INT || ' minutes')::INTERVAL;

      -- Only use last week's slot if it was within 48 hours (prevent week-long alive windows)
      IF extract(EPOCH FROM v_server_now - v_slot_ts) > 172800 THEN
        -- No valid recent slot — just return next spawn
        RETURN jsonb_build_object('can_kill', false, 'reason', 'No recent schedule slot within 48h');
      END IF;
    ELSE
      -- Build timestamp for today's slot
      v_slot_ts := date_trunc('day', v_server_now)
        + (split_part(v_best_time, ':', 1)::INT || ' hours')::INTERVAL
        + (split_part(v_best_time, ':', 2)::INT || ' minutes')::INTERVAL;
    END IF;

    -- If there's a death record, check if it was killed AFTER the most recent slot
    IF v_latest.death_time IS NOT NULL THEN
      IF v_latest.death_time >= v_slot_ts THEN
        -- Already killed in this window
        RETURN jsonb_build_object('can_kill', false, 'reason', 'Already killed in current window');
      END IF;
    END IF;

    -- No death this window — boss is alive
    RETURN jsonb_build_object('can_kill', true, 'boss_name', v_boss.name);
  END IF;

  RETURN jsonb_build_object('can_kill', false, 'reason', 'Unknown spawn type');
END;
$$;
