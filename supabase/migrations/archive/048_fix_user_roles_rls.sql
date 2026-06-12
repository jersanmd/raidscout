-- Fix recursive RLS policies on user_roles causing 500 for non-admin users
DROP POLICY IF EXISTS "Admins can read roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "users_read_own_role" ON public.user_roles;
CREATE POLICY "Users can read own role" ON public.user_roles FOR SELECT USING (user_id = auth.uid());
