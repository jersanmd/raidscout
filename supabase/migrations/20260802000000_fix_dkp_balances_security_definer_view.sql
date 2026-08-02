-- Fix: public.dkp_balances ran as its owner (postgres), bypassing RLS on
-- dkp_transactions. Any authenticated (and even anon) user could read every
-- member's DKP balance across every server via PostgREST. Internal RPCs are
-- unaffected: they run as `postgres`, which has BYPASSRLS regardless of this
-- setting.

ALTER VIEW public.dkp_balances SET (security_invoker = on);

-- The view is a GROUP BY/aggregate query, so it was never write-through
-- (is_insertable_into = NO) — these write grants were always inert, but
-- revoke them for least-privilege cleanliness. anon has no legitimate reason
-- to read DKP balances at all.
REVOKE ALL ON public.dkp_balances FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.dkp_balances FROM authenticated;
