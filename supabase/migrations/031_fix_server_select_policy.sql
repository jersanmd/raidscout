-- Allow authenticated users to read server names for duplicate checking
-- This fixes the 500 error when creating a first server
CREATE POLICY "Authenticated users can read server names" ON public.servers
  FOR SELECT USING (auth.role() = 'authenticated');
