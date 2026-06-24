-- 178: Disable RLS on dkp_auctions — matches staging behavior.
-- RLS was accidentally enabled on production (likely via dashboard) with no policies,
-- blocking the getActiveAuctions direct query from reading auctions.
ALTER TABLE public.dkp_auctions DISABLE ROW LEVEL SECURITY;
