-- RPC to get all site admin user IDs (for masking admin emails in member lists)
CREATE OR REPLACE FUNCTION get_admin_user_ids()
RETURNS TABLE (user_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin';
$$;
