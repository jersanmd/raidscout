-- Bidding scalability, part 1: schema.
--
-- Three structural changes, each killing a measured hot-path cost:
--
-- 1. dkp_balances becomes a real table maintained by a ledger trigger. The view
--    it replaces re-aggregated a member's entire transaction history (1,500+ rows
--    for heavy members, growing forever) on every balance check — including the
--    one inside place_bid. Balance reads become a single-row PK lookup, and the
--    row doubles as the lock that serializes a member's concurrent spending.
--
-- 2. dkp_auctions carries highest_bid / highest_bidder_id / bid_count. The
--    current state of an auction was previously derived by sorting dkp_bids on
--    every read, through an index whose leading column the query never
--    constrained (measured: 775 index entries scanned to find 1 row).
--
-- 3. Indexes shaped like the bid path actually queries: dkp_bids by auction.
--    Every existing index leads with item_id; place_bid and resolve_auction
--    filter by auction_id.
--
-- The ledger (dkp_transactions) remains the source of historical truth. Nothing
-- is deleted; the balance table is derived state, rebuildable at any time from
-- the backfill statement below.

-- ── 1. dkp_balances: view → table ──────────────────────────────────────────

DROP VIEW IF EXISTS public.dkp_balances;

CREATE TABLE public.dkp_balances (
  member_id  UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  server_id  UUID NOT NULL,
  balance    BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, server_id)
);

-- Deliberately no CHECK (balance >= 0): attendance-removal reversals may
-- legitimately deduct DKP a member already spent, driving the balance negative
-- (existing, accepted behavior). Overspend-by-bidding is prevented in place_bid
-- by validating under a row lock, not by a table constraint that would make
-- unrelated attendance edits start failing.

ALTER TABLE public.dkp_balances ENABLE ROW LEVEL SECURITY;

-- The frontend reads balances through SECURITY DEFINER RPCs (get_member_dkp,
-- get_server_dkp_rankings), which bypass RLS. Direct table access is limited to
-- reading your own row, plus staff reading their server's rows.
CREATE POLICY "Members read own balance" ON public.dkp_balances
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.members m
            WHERE m.id = dkp_balances.member_id AND m.user_id = (SELECT auth.uid()))
  );
CREATE POLICY "Staff read server balances" ON public.dkp_balances
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.server_members sm
            WHERE sm.server_id = dkp_balances.server_id
              AND sm.user_id = (SELECT auth.uid())
              AND sm.role IN ('owner','moderator'))
  );

-- Ledger trigger keeps the table consistent with dkp_transactions. Handles
-- UPDATE/DELETE too: past cleanup migrations have deleted duplicate ledger rows,
-- and future ones must keep balances true without knowing about this table.
CREATE OR REPLACE FUNCTION public.apply_dkp_txn_to_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    INSERT INTO public.dkp_balances (member_id, server_id, balance, updated_at)
    VALUES (NEW.member_id, NEW.server_id, NEW.amount, now())
    ON CONFLICT (member_id, server_id)
    DO UPDATE SET balance = public.dkp_balances.balance + EXCLUDED.balance,
                  updated_at = now();
  END IF;
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    UPDATE public.dkp_balances
    SET balance = balance - OLD.amount, updated_at = now()
    WHERE member_id = OLD.member_id AND server_id = OLD.server_id;
  END IF;
  RETURN NULL;
END;
$$;

-- SHARE lock closes the gap between snapshotting the ledger and the trigger
-- taking over: no transaction rows can be written while the backfill runs, so
-- nothing is double-counted or missed. The ledger is 11 MB; this is instant.
LOCK TABLE public.dkp_transactions IN SHARE MODE;

INSERT INTO public.dkp_balances (member_id, server_id, balance, updated_at)
SELECT member_id, server_id, COALESCE(SUM(amount), 0), now()
FROM public.dkp_transactions
GROUP BY member_id, server_id;

CREATE TRIGGER trg_dkp_txn_balance
AFTER INSERT OR UPDATE OR DELETE ON public.dkp_transactions
FOR EACH ROW EXECUTE FUNCTION public.apply_dkp_txn_to_balance();

-- ── 2. Denormalized auction state ──────────────────────────────────────────

ALTER TABLE public.dkp_auctions
  ADD COLUMN IF NOT EXISTS highest_bid       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS highest_bidder_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bid_count         INTEGER NOT NULL DEFAULT 0;

-- Backfill from bids. bid_count matches what the UI displayed before: bids in
-- status active/lost (a replaced own-bid is 'cancelled' and was never counted).
WITH agg AS (
  SELECT b.auction_id,
         COUNT(*) FILTER (WHERE b.status IN ('active','lost')) AS n_bids,
         (ARRAY_AGG(b.member_id ORDER BY b.bid_amount DESC, b.created_at ASC)
            FILTER (WHERE b.status = 'active'))[1] AS top_member,
         COALESCE(MAX(b.bid_amount) FILTER (WHERE b.status = 'active'), 0) AS top_amount
  FROM public.dkp_bids b
  WHERE b.auction_id IS NOT NULL
  GROUP BY b.auction_id
)
UPDATE public.dkp_auctions a
SET highest_bid       = CASE WHEN a.status = 'active' THEN agg.top_amount ELSE a.highest_bid END,
    highest_bidder_id = CASE WHEN a.status = 'active' THEN agg.top_member ELSE a.highest_bidder_id END,
    bid_count         = agg.n_bids
FROM agg
WHERE agg.auction_id = a.id;

-- ── 3. Indexes shaped like the bid path ─────────────────────────────────────

-- place_bid: "my existing active bid on this auction" and "previous highest
-- active bid"; resolve_auction: "all active bids on this auction". All filter
-- (auction_id, status='active'), optionally by member. Partial keeps it small
-- and immune to the dead-tuple churn of resolved statuses.
CREATE INDEX IF NOT EXISTS idx_dkp_bids_auction_active
  ON public.dkp_bids (auction_id, member_id)
  WHERE status = 'active';

-- Bid feeds (theater, bids modal): an auction's bids ordered by amount.
CREATE INDEX IF NOT EXISTS idx_dkp_bids_auction_amount
  ON public.dkp_bids (auction_id, bid_amount DESC);
