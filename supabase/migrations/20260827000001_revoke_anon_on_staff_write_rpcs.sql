-- Revoke anon EXECUTE on SECURITY DEFINER write RPCs that have no authorization
-- check of their own.
--
-- Found while fixing the create_custom_activity ambiguity: nine SECURITY DEFINER
-- functions that INSERT/UPDATE/DELETE were executable by the `anon` role — i.e.
-- by anyone holding the public anon key, which ships in the browser bundle — and
-- none of them verify the caller. Being SECURITY DEFINER, they also bypass RLS,
-- so the table policies were not a second line of defence.
--
-- The two that matter most:
--   create_moderator_permissions  — unauthenticated privilege escalation
--   delete_leaderboard_snapshot   — unauthenticated destruction of finalized results
--
-- Why revoking is safe: every caller of these lives in src/lib/api/*.ts and runs
-- authenticated. Viewer (logged-out) flows use the separate viewer_* RPCs, which
-- take a viewer_key and are untouched here. The Discord bot uses service_role,
-- which is unaffected by an anon revoke. create_moderator_permissions and
-- update_member_stats have no caller in the codebase at all.
--
-- This closes UNAUTHENTICATED access only. A separate gap remains and is NOT
-- addressed here: an authenticated user of server A can still call these for
-- server B, because the functions take a server_id and never check membership.
-- Fixing that means adding staff checks inside each body — a behavior change
-- deserving its own review, unlike this purely-additive lockout.
--
-- create_server_with_bosses is deliberately left alone: it is also anon-granted
-- but does verify its caller.

DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proname IN (
        'create_custom_activity',
        'create_custom_boss',
        'create_moderator_permissions',
        'create_static_party',
        'delete_leaderboard_snapshot',
        'delete_static_party',
        'update_custom_activity',
        'update_custom_boss',
        'update_member_stats'
      )
  LOOP
    -- Revoke from PUBLIC too: Postgres grants EXECUTE to PUBLIC by default and
    -- anon inherits it, so revoking anon alone would leave access intact.
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn.sig);
    RAISE NOTICE 'locked down %', fn.sig;
  END LOOP;
END $$;
