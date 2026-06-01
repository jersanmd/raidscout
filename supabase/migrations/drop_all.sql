-- Drop everything in public schema — run BEFORE all_migrations.sql
-- Paste this into SQL Editor and run first, then run all_migrations.sql

DO $$ DECLARE
  r RECORD;
BEGIN
  -- Drop all triggers
  FOR r IN (SELECT trigger_name, event_object_table FROM information_schema.triggers WHERE trigger_schema = 'public')
  LOOP EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', r.trigger_name, r.event_object_table); END LOOP;

  -- Drop all policies
  FOR r IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public')
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename); END LOOP;

  -- Drop all views
  FOR r IN (SELECT table_name FROM information_schema.views WHERE table_schema = 'public')
  LOOP EXECUTE format('DROP VIEW IF EXISTS %I CASCADE', r.table_name); END LOOP;

  -- Drop all functions
  FOR r IN (SELECT proname, oid::regprocedure AS sig FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND prokind = 'f')
  LOOP EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.sig); END LOOP;

  -- Drop all tables
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename DESC)
  LOOP EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', r.tablename); END LOOP;

  -- Reset migration tracking
  DELETE FROM supabase_migrations.schema_migrations;
END $$;
