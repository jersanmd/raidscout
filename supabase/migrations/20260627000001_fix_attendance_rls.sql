-- Fix attendance_records RLS: add UPDATE policy so upserts (INSERT ON CONFLICT DO UPDATE) work.
-- Without this, PostgREST upserts fail because DO UPDATE requires UPDATE permission.
-- Also add DELETE policy scoped to server membership.

-- Drop old broad policies (from 002_attendance.sql archive)
DROP POLICY IF EXISTS "Authenticated users can insert attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "Authenticated users can delete attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "Authenticated users can read attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "Anon users can read attendance" ON public.attendance_records;

-- SELECT: server members + anon can read
DROP POLICY IF EXISTS "Server members can read attendance" ON public.attendance_records;
CREATE POLICY "Server members can read attendance" ON public.attendance_records
  FOR SELECT
  USING (
    server_id IN (SELECT sm.server_id FROM public.server_members sm WHERE sm.user_id = auth.uid())
    OR (auth.role() = 'anon' AND EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = attendance_records.server_id))
  );

-- INSERT: server members can insert
DROP POLICY IF EXISTS "Server members can insert attendance" ON public.attendance_records;
CREATE POLICY "Server members can insert attendance" ON public.attendance_records
  FOR INSERT
  WITH CHECK (
    server_id IN (SELECT sm.server_id FROM public.server_members sm WHERE sm.user_id = auth.uid())
  );

-- UPDATE: server members can update (needed for upserts: INSERT ON CONFLICT DO UPDATE)
DROP POLICY IF EXISTS "Server members can update attendance" ON public.attendance_records;
CREATE POLICY "Server members can update attendance" ON public.attendance_records
  FOR UPDATE
  USING (
    server_id IN (SELECT sm.server_id FROM public.server_members sm WHERE sm.user_id = auth.uid())
  )
  WITH CHECK (
    server_id IN (SELECT sm.server_id FROM public.server_members sm WHERE sm.user_id = auth.uid())
  );

-- DELETE: server members can delete
DROP POLICY IF EXISTS "Server members can delete attendance" ON public.attendance_records;
CREATE POLICY "Server members can delete attendance" ON public.attendance_records
  FOR DELETE
  USING (
    server_id IN (SELECT sm.server_id FROM public.server_members sm WHERE sm.user_id = auth.uid())
  );
