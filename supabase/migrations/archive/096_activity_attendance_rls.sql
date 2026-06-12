-- 096_activity_attendance_rls: Add RLS policies for activity_attendance table

-- Allow server members to read activity attendance for activities in their server
CREATE POLICY "Server members can read activity attendance" ON public.activity_attendance
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.activity_instances ai
      JOIN public.activities a ON a.id = ai.activity_id
      JOIN public.server_members sm ON sm.server_id = a.server_id
      WHERE ai.id = activity_attendance.activity_instance_id
        AND sm.user_id = auth.uid()
    )
    OR public.is_admin()
  );

-- Allow owners and moderators to insert/update activity attendance
CREATE POLICY "Owners and moderators can manage activity attendance" ON public.activity_attendance
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.activity_instances ai
      JOIN public.activities a ON a.id = ai.activity_id
      JOIN public.server_members sm ON sm.server_id = a.server_id
      WHERE ai.id = activity_attendance.activity_instance_id
        AND sm.user_id = auth.uid()
        AND sm.role IN ('owner', 'moderator')
    )
    OR public.is_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.activity_instances ai
      JOIN public.activities a ON a.id = ai.activity_id
      JOIN public.server_members sm ON sm.server_id = a.server_id
      WHERE ai.id = activity_attendance.activity_instance_id
        AND sm.user_id = auth.uid()
        AND sm.role IN ('owner', 'moderator')
    )
    OR public.is_admin()
  );
    