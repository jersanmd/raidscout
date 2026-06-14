-- 028_death_records_insert_policy: Ensure death_records has INSERT policy for server members
-- Fixes "Cannot record a death in a new server" issue

-- Ensure the INSERT policy exists (it may have been dropped in previous migrations)
DROP POLICY IF EXISTS "Users can insert their own death records" ON public.death_records;
CREATE POLICY "Users can insert their own death records" ON public.death_records
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
  );

-- Also ensure server members can read (already may exist, but ensure it)
DROP POLICY IF EXISTS "Server members can read death records" ON public.death_records;
CREATE POLICY "Server members can read death records" ON public.death_records
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.server_members sm
      WHERE sm.server_id = death_records.server_id
      AND sm.user_id = auth.uid()
    )
    OR auth.uid() = death_records.user_id
  );
