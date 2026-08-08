-- Fix: the "Distributed" green indicator never appeared for catalog/global items.
--
-- Regression from 20260802000001, which enabled RLS on dkp_distributed with
-- policies that resolve the owning server by joining through the item:
--
--     FROM items i JOIN server_members sm ON sm.server_id = i.server_id
--
-- Game-level/catalog items have items.server_id IS NULL, so that join matches no
-- rows and the policy denies access. The marker is still WRITTEN correctly --
-- toggle_item_distributed is SECURITY DEFINER and bypasses RLS -- but the frontend
-- reads dkp_distributed directly (getPastAuctions), so the row is invisible and the
-- indicator never shows. Distribution therefore appeared to "work only for items
-- created in the server."
--
-- 183 markers on global items are currently hidden this way.
--
-- Fix: resolve the server through dkp_auctions instead. Every dkp_distributed row
-- carries auction_id (zero NULLs on production) and every auction has a non-null
-- server_id, so this works for both global and server-scoped items. The original
-- item-based branch is kept as an OR fallback in case any legacy row ever has a
-- NULL auction_id.

DROP POLICY IF EXISTS "Members can read distributed status" ON public.dkp_distributed;
CREATE POLICY "Members can read distributed status" ON public.dkp_distributed
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.dkp_auctions a
      JOIN public.server_members sm ON sm.server_id = a.server_id
      WHERE a.id = dkp_distributed.auction_id AND sm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.dkp_auctions a
      JOIN public.servers s ON s.id = a.server_id
      WHERE a.id = dkp_distributed.auction_id AND s.viewer_key IS NOT NULL
    )
    OR EXISTS (
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
      SELECT 1 FROM public.dkp_auctions a
      JOIN public.server_members sm ON sm.server_id = a.server_id
      WHERE a.id = dkp_distributed.auction_id AND sm.user_id = auth.uid()
        AND sm.role IN ('owner', 'moderator')
    )
    OR EXISTS (
      SELECT 1 FROM public.items i
      JOIN public.server_members sm ON sm.server_id = i.server_id
      WHERE i.id = dkp_distributed.item_id AND sm.user_id = auth.uid()
        AND sm.role IN ('owner', 'moderator')
    )
  );
