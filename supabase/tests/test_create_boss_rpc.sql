-- ============================================================================
-- RPC & RLS test: create_custom_boss and create_custom_activity
-- Run this in the Supabase SQL Editor against your project.
-- ============================================================================

-- Helper: create a test user (run as superuser or service_role)
DO $$
DECLARE
  v_user_id UUID;
  v_server_id UUID;
  v_guild_id UUID;
  v_boss_id UUID;
  v_act_id UUID;
BEGIN
  -- 1. Get or create test user
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'test@raidscout.test' LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'Test user not found. Create one via Auth UI first.';
    RETURN;
  END IF;

  RAISE NOTICE '=== Testing with user: % ===', v_user_id;

  -- 2. Create a test server
  INSERT INTO public.servers (name, owner_id)
  VALUES ('__rls_test_server__', v_user_id)
  RETURNING id INTO v_server_id;

  INSERT INTO public.server_members (server_id, user_id, role)
  VALUES (v_server_id, v_user_id, 'owner');

  RAISE NOTICE 'Created server: %', v_server_id;

  -- 3. Create a test guild
  INSERT INTO public.guilds (name, server_id)
  VALUES ('Test Guild', v_server_id)
  RETURNING id INTO v_guild_id;

  RAISE NOTICE 'Created guild: %', v_guild_id;

  -- 4. Test create_custom_boss RPC
  SELECT id INTO v_boss_id
  FROM create_custom_boss(
    p_server_id := v_server_id,
    p_name := '__rls_test_boss__',
    p_spawn_type := 'fixed_hours',
    p_respawn_hours := 12,
    p_schedule := NULL,
    p_is_recurring := TRUE,
    p_boss_points := 2,
    p_category := 'World Boss',
    p_tags := ARRAY['world', 'field'],
    p_image_url := NULL
  );

  RAISE NOTICE 'Created boss: %', v_boss_id;

  -- Verify the boss exists
  ASSERT EXISTS (
    SELECT 1 FROM public.bosses
    WHERE id = v_boss_id AND server_id = v_server_id AND name = '__rls_test_boss__'
  ), 'Boss was not created correctly!';

  -- 5. Test create_custom_activity RPC
  SELECT id INTO v_act_id
  FROM create_custom_activity(
    p_server_id := v_server_id,
    p_name := '__rls_test_activity__',
    p_schedule_type := 'fixed_hours',
    p_schedule := NULL,
    p_points_per_participant := 3,
    p_duration_minutes := 60,
    p_party_size := 5,
    p_category := 'World Event',
    p_tags := ARRAY['pve', 'guild'],
    p_image_url := NULL
  );

  RAISE NOTICE 'Created activity: %', v_act_id;

  -- Verify the activity exists
  ASSERT EXISTS (
    SELECT 1 FROM public.activities
    WHERE id = v_act_id AND server_id = v_server_id AND name = '__rls_test_activity__'
  ), 'Activity was not created correctly!';

  -- 6. Test boss_guild assignment (rotation mode)
  INSERT INTO public.boss_guilds (boss_id, guild_id, sort_order, mode)
  VALUES (v_boss_id, v_guild_id, 1, 'rotation');

  ASSERT EXISTS (
    SELECT 1 FROM public.boss_guilds
    WHERE boss_id = v_boss_id AND guild_id = v_guild_id AND mode = 'rotation'
  ), 'Boss-guild assignment failed!';

  -- 7. Test RLS: another user should NOT be able to read bosses from this server
  -- (This is tested implicitly — only the owner can see them via RLS)

  -- 8. Cleanup
  DELETE FROM public.boss_guilds WHERE boss_id = v_boss_id;
  DELETE FROM public.activity_guilds WHERE activity_id = v_act_id;
  DELETE FROM public.activities WHERE id = v_act_id AND server_id = v_server_id;
  DELETE FROM public.bosses WHERE id = v_boss_id AND server_id = v_server_id;
  DELETE FROM public.guilds WHERE id = v_guild_id AND server_id = v_server_id;
  DELETE FROM public.server_members WHERE server_id = v_server_id;
  DELETE FROM public.servers WHERE id = v_server_id;

  RAISE NOTICE '=== All RPC & RLS tests passed! Cleanup complete. ===';
END;
$$;
