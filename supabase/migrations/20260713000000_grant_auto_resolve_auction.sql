-- Fix: Grant execute on auto_resolve_auction to anon and authenticated roles
-- Without this, PostgREST returns 400 for RPC calls
GRANT EXECUTE ON FUNCTION public.auto_resolve_auction(uuid) TO anon, authenticated;
