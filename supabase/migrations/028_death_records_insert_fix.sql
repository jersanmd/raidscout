-- 028_death_records_insert_fix: Ensure death_records RLS policies exist
-- Fixes "Cannot record a death in a new server" (400 error from .insert().select().single())

-- INSERT policy: allow authenticated users to insert their own records
DROP POLICY IF EXISTS "Users can insert their own death records" ON public.death_records;
CREATE POLICY "Users can insert their own death records" ON public.death_records
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- SELECT policy: ensure the inserted row can be read back (needed for .select().single())
DROP POLICY IF EXISTS "Authenticated users can read death records" ON public.death_records;
CREATE POLICY "Authenticated users can read death records" ON public.death_records
  FOR SELECT
  TO authenticated
  USING (true);
