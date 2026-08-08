-- Optional companion to 20260809000002: rebuild the dkp_distributed markers that
-- mark_item_for_bid's item-wide DELETE destroyed.
--
-- Every distribute action writes an audit row whose details carry auction_id and
-- auction_round, so the markers are reconstructable. item_id is taken from the
-- auction itself rather than the audit row's target_id, which guarantees the
-- (item_id, auction_id) pair is internally consistent; auctions that have since
-- been deleted are skipped by the JOIN.
--
-- CAVEAT worth knowing before running: un-distributing is NOT audited (there is no
-- dkp_item_undistributed action), so a marker that staff deliberately toggled OFF
-- is indistinguishable from one the bug deleted. This will restore both. On the
-- affected server 457 of 526 distributions had their item re-marked for bid
-- afterward -- i.e. the overwhelming majority were bug-deleted -- and any wrongly
-- restored marker can simply be toggled off again in the UI.
--
-- ON CONFLICT DO NOTHING makes this safe to re-run.

INSERT INTO public.dkp_distributed (item_id, auction_round, auction_id)
SELECT DISTINCT
  a.item_id,
  COALESCE((l.details->>'auction_round')::int, 1),
  a.id
FROM public.admin_audit_log l
JOIN public.dkp_auctions a ON a.id = (l.details->>'auction_id')::uuid
WHERE l.action = 'dkp_item_distributed'
  AND l.details->>'auction_id' IS NOT NULL
ON CONFLICT DO NOTHING;
