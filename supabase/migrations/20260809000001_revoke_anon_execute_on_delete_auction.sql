-- Follow-up to 20260809000000. That migration revoked EXECUTE on the new
-- delete_auction function FROM PUBLIC, which was necessary but not sufficient.
--
-- Supabase configures ALTER DEFAULT PRIVILEGES to GRANT EXECUTE ON FUNCTIONS to
-- anon/authenticated/service_role, so a newly CREATEd function in the public
-- schema receives an *explicit* anon grant on top of the implicit PUBLIC one.
-- Revoking PUBLIC alone left `anon=X/postgres` in the ACL and
-- has_function_privilege('anon', ...) still returned true.
--
-- (The five functions hardened in 20260808000003/4 were CREATE OR REPLACE over
-- pre-existing functions, which preserves the existing ACL and does not re-apply
-- default privileges -- so they were unaffected and remain correctly locked down.)
--
-- Not exploitable in the meantime: the in-function staff check rejects anon with
-- 'Staff access required'. This aligns the grant with the intent.

REVOKE EXECUTE ON FUNCTION public.delete_auction(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_auction(UUID) TO authenticated;
