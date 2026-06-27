-- 189: Re-enable RLS on dkp_auctions with proper policies
-- Replaces migration 178 which disabled RLS as a workaround.
-- Now adds proper policies so authenticated users can read auctions
-- for servers they belong to, and owners/mods can manage them.

ALTER TABLE public.dkp_auctions ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies on dkp_auctions (clean slate)
DROP POLICY IF EXISTS "Members can read server auctions" ON public.dkp_auctions;
DROP POLICY IF EXISTS "Owner and mods can manage auctions" ON public.dkp_auctions;

-- Members (and viewers) can read auctions for servers they have access to
CREATE POLICY "Members can read server auctions" ON public.dkp_auctions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.server_members
      WHERE server_id = dkp_auctions.server_id
        AND user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.servers
      WHERE id = dkp_auctions.server_id
        AND viewer_key IS NOT NULL
    )
  );

-- Only owners and moderators can insert, update, or delete auctions
CREATE POLICY "Owner and mods can manage auctions" ON public.dkp_auctions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.server_members
      WHERE server_id = dkp_auctions.server_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'moderator')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.server_members
      WHERE server_id = dkp_auctions.server_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'moderator')
    )
  );
