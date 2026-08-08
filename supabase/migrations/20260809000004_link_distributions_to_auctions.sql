-- Scope the "Distributed" indicator cleanup to a single auction.
--
-- Deleting one distribution record in Inventory called
-- clear_item_distributed(item_id), which deleted EVERY dkp_distributed row for
-- that item -- so removing one record cleared the green check from every other
-- auction of the same item too. Same item_id-vs-auction_id scoping mistake as
-- 20260809000000 (delete_auction) and 20260809000002 (mark_item_for_bid).
--
-- The distributions table had no link back to the auction a record came from, so
-- there was nothing to scope by. This adds one.
--
-- Backfill: each distribute click also writes a dkp_item_distributed audit row
-- carrying auction_id, and shares the exact `reason` string and recipient with the
-- distributions row. Matching on (item, reason, recipient, ±2 min) resolves 416 of
-- 473 records to exactly one auction. The remaining ~57 (duplicate-auction rounds
-- where the same player won the same item at the same price) stay NULL and simply
-- clear nothing on delete -- deliberately chosen over guessing, since clearing the
-- wrong auction's marker is the bug being fixed.

ALTER TABLE public.distributions
  ADD COLUMN IF NOT EXISTS auction_id UUID REFERENCES public.dkp_auctions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS distributions_auction_id_idx ON public.distributions(auction_id);

UPDATE public.distributions d
SET auction_id = sub.auction_id
FROM (
  SELECT dd.id AS dist_id, MIN(l.details->>'auction_id')::uuid AS auction_id
  FROM public.distributions dd
  JOIN public.admin_audit_log l
    ON l.action = 'dkp_item_distributed'
   AND l.server_id = dd.server_id
   AND l.target_id::uuid = dd.item_id
   AND l.details->>'reason' = dd.reason
   AND l.details->>'recipient_name' = dd.player_name
   AND l.created_at BETWEEN dd.distributed_at - interval '2 minutes'
                        AND dd.distributed_at + interval '2 minutes'
  WHERE l.details->>'auction_id' IS NOT NULL
  GROUP BY dd.id
  HAVING COUNT(DISTINCT l.details->>'auction_id') = 1
) sub
WHERE d.id = sub.dist_id
  AND d.auction_id IS NULL
  AND EXISTS (SELECT 1 FROM public.dkp_auctions a WHERE a.id = sub.auction_id);

-- Replace the item-wide clear with an auction-scoped one.
DROP FUNCTION IF EXISTS public.clear_item_distributed(uuid);

CREATE OR REPLACE FUNCTION public.clear_distributed_for_auction(p_auction_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_server_id UUID;
BEGIN
  SELECT server_id INTO v_server_id FROM public.dkp_auctions WHERE id = p_auction_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.server_members
    WHERE user_id = auth.uid() AND server_id = v_server_id AND role IN ('owner', 'moderator')
  ) THEN
    RAISE EXCEPTION 'Staff access required';
  END IF;

  DELETE FROM public.dkp_distributed WHERE auction_id = p_auction_id;
END;
$$;

-- New function in the public schema: Supabase default privileges grant EXECUTE to
-- anon/authenticated/service_role, and the implicit PUBLIC grant also applies, so
-- both must be revoked (see 20260809000001).
REVOKE EXECUTE ON FUNCTION public.clear_distributed_for_auction(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_distributed_for_auction(UUID) TO authenticated;
