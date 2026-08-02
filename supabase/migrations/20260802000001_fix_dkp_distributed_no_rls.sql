-- Fix: public.dkp_distributed had RLS disabled entirely (migration 182 disabled it
-- as a workaround after an earlier attempt enabled RLS with zero policies, which
-- default-denied everyone and broke the UI). Combined with Supabase's default
-- grants, this left the table fully open: anon (unauthenticated) and
-- authenticated could INSERT/UPDATE/DELETE any row directly via PostgREST,
-- letting anyone forge or clear "item distributed" markers.
--
-- This re-enables RLS with a real SELECT policy this time (scoped the same way
-- as the sibling dkp_auctions/items tables: server membership, or a server's
-- public viewer link) plus a staff-manage policy, then locks down the redundant
-- write grants. All real writes already go through SECURITY DEFINER RPCs
-- (delete_auction_round, mark_item_for_bid, etc.), which run as `postgres`
-- (BYPASSRLS) and are unaffected by this change.

ALTER TABLE public.dkp_distributed ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read distributed status" ON public.dkp_distributed;
CREATE POLICY "Members can read distributed status" ON public.dkp_distributed
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.items i
      JOIN public.server_members sm ON sm.server_id = i.server_id
      WHERE i.id = dkp_distributed.item_id AND sm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.items i
      JOIN public.servers s ON s.id = i.server_id
      WHERE i.id = dkp_distributed.item_id AND s.viewer_key IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "Staff manage distributed status" ON public.dkp_distributed;
CREATE POLICY "Staff manage distributed status" ON public.dkp_distributed
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.items i
      JOIN public.server_members sm ON sm.server_id = i.server_id
      WHERE i.id = dkp_distributed.item_id AND sm.user_id = auth.uid()
        AND sm.role IN ('owner', 'moderator')
    )
  );

REVOKE ALL ON public.dkp_distributed FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.dkp_distributed FROM authenticated;
