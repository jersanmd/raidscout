-- 102_anon_read_attendance: Allow anon/viewer reads on attendance_records
-- Fixes analytics "all time" not loading in viewer mode.

DROP POLICY IF EXISTS "Anon users can read attendance" ON public.attendance_records;
CREATE POLICY "Anon users can read attendance" ON public.attendance_records FOR SELECT USING (true);
