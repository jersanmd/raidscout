-- 011_server_classes_viewer: Allow viewers (anon) to read class data

-- server_classes: icon + color definitions
CREATE POLICY "Anyone can read server_classes" ON public.server_classes
  FOR SELECT USING (true);

-- members: ensure anon can read (class column lives here)
-- If a "to authenticated" policy exists on members, this adds anon access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'members' AND policyname = 'Anyone can read members'
  ) THEN
    CREATE POLICY "Anyone can read members" ON public.members
      FOR SELECT USING (true);
  END IF;
END $$;
