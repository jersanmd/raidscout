-- Drop redundant, previously-untracked RLS policy on dkp_distributed.
-- "Server members can view distributed items" duplicated the membership
-- check already covered by "Members can read distributed status" (added in
-- 20260802000001_fix_dkp_distributed_no_rls.sql), minus the public-viewer-link
-- clause. It predates that migration and wasn't tracked anywhere in this
-- repo -- likely a manual SQL editor change from an earlier attempt to patch
-- this table's RLS gap. Dropping it so production matches migration history.

DROP POLICY IF EXISTS "Server members can view distributed items" ON public.dkp_distributed;
