-- Add UPDATE policy for item_collection_items (needed for reordering)
-- Also add update policy for manual_ownership

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'collection_items_update' AND tablename = 'item_collection_items') THEN CREATE POLICY "collection_items_update" ON public.item_collection_items FOR UPDATE USING (collection_id IN (SELECT id FROM public.item_collections WHERE server_id IN (SELECT id FROM public.servers))); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'manual_ownership_update' AND tablename = 'item_collection_manual_ownership') THEN CREATE POLICY "manual_ownership_update" ON public.item_collection_manual_ownership FOR UPDATE USING (collection_id IN (SELECT id FROM public.item_collections WHERE server_id IN (SELECT id FROM public.servers))); END IF; END $$;
