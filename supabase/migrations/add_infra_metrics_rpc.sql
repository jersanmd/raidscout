-- Deploy: supabase migrations up
-- Creates get_infra_metrics() RPC for Admin Panel infra monitoring
CREATE OR REPLACE FUNCTION public.get_infra_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'db_size_bytes', pg_database_size(current_database()),
    'db_size_pretty', pg_size_pretty(pg_database_size(current_database())),
    'table_count', (SELECT count(*) FROM pg_stat_user_tables WHERE schemaname = 'public'),
    'table_counts', (
      SELECT jsonb_object_agg(relname, n_live_tup)
      FROM pg_stat_user_tables
      WHERE schemaname = 'public'
        AND relname IN ('servers', 'members', 'death_records', 'attendance_records', 'spawn_notifications', 'audit_log', 'items', 'bosses')
    ),
    'active_connections', (SELECT count(*) FROM pg_stat_activity WHERE state = 'active'),
    'total_connections', (SELECT count(*) FROM pg_stat_activity)
  ) INTO result;
  
  RETURN result;
END;
$$;
