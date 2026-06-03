-- Drop all get_leaderboard functions
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT oid::regprocedure AS sig FROM pg_proc WHERE proname = 'get_leaderboard')
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig;
  END LOOP;
END $$;
