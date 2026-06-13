-- Migration 015: Allow viewers (anon) to read cp_updates and member_notes
-- Fixes: CP trend and Notes not visible in viewer mode

-- cp_updates: allow anon read access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'cp_updates' AND policyname = 'Anyone can read cp_updates'
  ) THEN
    CREATE POLICY "Anyone can read cp_updates" ON public.cp_updates
      FOR SELECT USING (true);
  END IF;
END $$;

-- member_notes: allow anon read access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'member_notes' AND policyname = 'Anyone can read member_notes'
  ) THEN
    CREATE POLICY "Anyone can read member_notes" ON public.member_notes
      FOR SELECT USING (true);
  END IF;
END $$;
