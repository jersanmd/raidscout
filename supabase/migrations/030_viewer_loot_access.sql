-- Migration 030: Allow viewers (anon) to read distributions and items (loot history)
-- Fixes: Loot History not visible in viewer mode for member profiles

-- distributions: allow anon read access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'distributions' AND policyname = 'Anyone can read distributions'
  ) THEN
    CREATE POLICY "Anyone can read distributions" ON public.distributions
      FOR SELECT USING (true);
  END IF;
END $$;

-- items: allow anon read access (needed for loot history item details)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'items' AND policyname = 'Anyone can read items'
  ) THEN
    CREATE POLICY "Anyone can read items" ON public.items
      FOR SELECT USING (true);
  END IF;
END $$;
