-- 010_member_classes: Dedicated table for member classes (simple CRUD)

CREATE TABLE IF NOT EXISTS public.member_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(server_id, name)
);

ALTER TABLE public.member_classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Server members can read classes" ON public.member_classes
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM server_members WHERE server_id = member_classes.server_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Moderators can manage classes" ON public.member_classes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM server_members WHERE server_id = member_classes.server_id AND user_id = auth.uid() AND role IN ('owner','moderator'))
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
