-- Migration 016: Add delete/update policies for server_classes
-- Required for class management in MembersView

-- Check if server_classes has RLS enabled (if not, enable it)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'server_classes' AND rowsecurity = true
  ) THEN
    ALTER TABLE public.server_classes ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Allow anyone to read server_classes (viewers included)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'server_classes' AND policyname = 'Anyone can read server_classes'
  ) THEN
    CREATE POLICY "Anyone can read server_classes" ON public.server_classes FOR SELECT USING (true);
  END IF;
END $$;

-- Allow server moderators/owners to insert, update, delete classes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'server_classes' AND policyname = 'Moderators can manage server_classes'
  ) THEN
    CREATE POLICY "Moderators can manage server_classes" ON public.server_classes
      FOR ALL USING (
        EXISTS (SELECT 1 FROM server_members WHERE server_id = server_classes.server_id AND user_id = auth.uid() AND role IN ('owner','moderator'))
        OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM server_members WHERE server_id = server_classes.server_id AND user_id = auth.uid() AND role IN ('owner','moderator'))
        OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;
