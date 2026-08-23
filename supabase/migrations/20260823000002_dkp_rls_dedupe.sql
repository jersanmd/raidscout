-- Bidding scalability, part 3: drop exact-duplicate RLS policies.
--
-- Postgres evaluates every applicable policy on every row check. Two pairs on
-- the DKP tables are literal duplicates of each other (same command, same
-- roles, same USING clause modulo alias names), so each check ran twice.
--
-- Security semantics are unchanged: in both pairs the surviving policy is
-- textually equivalent to the dropped one.
--
--   dkp_auctions:      "Owner and mods can manage auctions"  (dup of "Moderators can manage auctions")
--   dkp_transactions:  "Members read own transactions"       (dup of "Members read own dkp transactions")
--
-- A third is a strict subset: "Server members can view auctions" is exactly the
-- first disjunct of "Members can read server auctions" (which adds the
-- viewer-key path). Policies are OR'd, so the subset can never grant anything
-- the superset doesn't — dropping it removes a redundant check per row.

DROP POLICY IF EXISTS "Owner and mods can manage auctions" ON public.dkp_auctions;
DROP POLICY IF EXISTS "Server members can view auctions" ON public.dkp_auctions;
DROP POLICY IF EXISTS "Members read own transactions" ON public.dkp_transactions;
