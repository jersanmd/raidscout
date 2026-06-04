-- ═══════════════════════════════════════════════════════════════
-- Fix infinite recursion in user_roles RLS policies
-- Root cause: policies on user_roles reference user_roles itself,
-- causing infinite recursion when any other table's RLS checks
-- EXISTS (SELECT 1 FROM user_roles ...).
-- Solution: SECURITY DEFINER function that bypasses RLS
-- ═══════════════════════════════════════════════════════════════

-- 1. Drop existing function to avoid signature conflicts
DROP FUNCTION IF EXISTS public.is_admin(uid uuid);
DROP FUNCTION IF EXISTS public.is_admin();

-- 2. Create a security definer function to check admin status
CREATE OR REPLACE FUNCTION public.is_admin(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = uid AND role = 'admin'
  );
END;
$$;

-- 2. Drop all existing policies on user_roles (to avoid recursion)
DROP POLICY IF EXISTS "Users can read own role" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can read roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;

-- 3. Recreate user_roles policies using is_admin() — no self-reference
CREATE POLICY "Users can read own role" ON public.user_roles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins can read roles" ON public.user_roles
  FOR SELECT USING (is_admin());

CREATE POLICY "Admins can insert roles" ON public.user_roles
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "Admins can update roles" ON public.user_roles
  FOR UPDATE USING (is_admin());

CREATE POLICY "Admins can delete roles" ON public.user_roles
  FOR DELETE USING (is_admin());

-- 4. Fix app_settings: "Admins can manage" used FOR ALL which covers SELECT,
--    causing SELECTs on app_settings to still trigger the (recursive) user_roles check.
--    The "Anyone can read" policy already handles SELECT for everyone.
DROP POLICY IF EXISTS "Admins can manage app settings" ON public.app_settings;
CREATE POLICY "Admins can insert app settings" ON public.app_settings
  FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "Admins can update app settings" ON public.app_settings
  FOR UPDATE USING (is_admin());
CREATE POLICY "Admins can delete app settings" ON public.app_settings
  FOR DELETE USING (is_admin());
