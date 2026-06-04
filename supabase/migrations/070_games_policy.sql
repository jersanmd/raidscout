CREATE POLICY "Anyone can read games" ON public.games FOR SELECT USING (true);
NOTIFY pgrst, 'reload schema';
