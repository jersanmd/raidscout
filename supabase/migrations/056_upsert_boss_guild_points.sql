-- 056_upsert_boss_guild_points: SECURITY DEFINER RPC to bypass RLS for points/salary upsert
-- Also adds get_plan_usage RPC for admin dashboard storage stats

-- Plan usage RPC (admin dashboard Database tab)
CREATE OR REPLACE FUNCTION public.get_plan_usage()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_db_size_bytes BIGINT;
  v_db_size TEXT;
  v_cache_ratio NUMERIC;
  v_active_conns INT;
  v_idle_conns INT;
  v_total_conns INT;
  v_max_conns INT;
  v_auth_users INT;
  v_active_users_30d INT;
  v_storage_bytes BIGINT;
  v_storage_pretty TEXT;
  v_storage_objects INT;
  v_total_rows BIGINT;
  v_table_count INT;
BEGIN
  -- Database size
  SELECT pg_database_size(current_database()) INTO v_db_size_bytes;
  v_db_size := pg_size_pretty(v_db_size_bytes);

  -- Cache hit ratio
  SELECT ROUND((sum(heap_blks_hit)::numeric / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0)) * 100, 1)
    INTO v_cache_ratio FROM pg_statio_user_tables;

  -- Connections
  SELECT count(*) INTO v_active_conns FROM pg_stat_activity WHERE state = 'active';
  SELECT count(*) INTO v_idle_conns FROM pg_stat_activity WHERE state = 'idle';
  SELECT count(*) INTO v_total_conns FROM pg_stat_activity;
  SELECT setting::int INTO v_max_conns FROM pg_settings WHERE name = 'max_connections';

  -- Auth users
  BEGIN
    SELECT count(*) INTO v_auth_users FROM auth.users;
    SELECT count(*) INTO v_active_users_30d
      FROM auth.users WHERE last_sign_in_at > now() - interval '30 days';
  EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
    v_auth_users := 0;
    v_active_users_30d := 0;
  END;

  -- Storage (from storage schema — file size is in metadata JSON)
  BEGIN
    SELECT COALESCE(sum(COALESCE((o.metadata->>'size')::bigint, 0)), 0)
      INTO v_storage_bytes FROM storage.objects o;
  EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
    v_storage_bytes := 0;
  END;
    
  v_storage_pretty := pg_size_pretty(COALESCE(v_storage_bytes, 0));
  
  BEGIN
    SELECT count(*) INTO v_storage_objects FROM storage.objects;
  EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
    v_storage_objects := 0;
  END;

  -- Total rows across all user tables
  SELECT COALESCE(sum(n_live_tup), 0) INTO v_total_rows FROM pg_stat_user_tables;
  SELECT count(*) INTO v_table_count FROM pg_stat_user_tables;

  RETURN jsonb_build_object(
    'db_size', v_db_size,
    'db_size_bytes', v_db_size_bytes,
    'cache_hit_ratio', v_cache_ratio,
    'active_connections', v_active_conns,
    'idle_connections', v_idle_conns,
    'total_connections', v_total_conns,
    'max_connections', v_max_conns,
    'auth_users', v_auth_users,
    'active_auth_users_30d', v_active_users_30d,
    'storage_size_bytes', v_storage_bytes,
    'storage_size_pretty', v_storage_pretty,
    'storage_objects', v_storage_objects,
    'total_rows', v_total_rows,
    'table_count', v_table_count,
    'timestamp', now()
  );
END;
$$;

-- Boss guild points RPC (bypasses RLS for salary/points save)
CREATE OR REPLACE FUNCTION public.upsert_boss_guild_points(
  p_boss_id UUID,
  p_guild_id UUID,
  p_points INTEGER DEFAULT NULL,
  p_has_salary BOOLEAN DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INT;
BEGIN
  -- Verify caller is a member of the boss's server (owner, moderator, or regular member)
  IF NOT EXISTS (
    SELECT 1 FROM public.bosses b
    JOIN public.server_members sm ON sm.server_id = b.server_id
    WHERE b.id = p_boss_id AND sm.user_id = auth.uid()
  ) THEN
    -- Also allow platform admins
    IF NOT coalesce(public.is_admin(), false) THEN
      RAISE EXCEPTION 'You are not a member of the server that owns this boss';
    END IF;
  END IF;

  -- Check if any rows exist for this boss+guild
  SELECT COUNT(*) INTO v_count FROM public.boss_guilds
  WHERE boss_id = p_boss_id AND guild_id = p_guild_id;

  IF v_count > 0 THEN
    -- Update ALL existing rows for this boss+guild
    UPDATE public.boss_guilds SET
      points = COALESCE(p_points, points),
      has_salary = COALESCE(p_has_salary, has_salary)
    WHERE boss_id = p_boss_id AND guild_id = p_guild_id;
  ELSE
    -- Insert a points/salary-only row (not a guild assignment)
    INSERT INTO public.boss_guilds (boss_id, guild_id, sort_order, day_of_week, mode, points, has_salary)
    VALUES (p_boss_id, p_guild_id, -1, NULL, 'rotation', p_points, COALESCE(p_has_salary, false));
  END IF;
END;
$$;
