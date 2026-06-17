-- Manual ownership overrides for collection items
-- Allows server owners/moderators to manually mark items as owned/not-owned
CREATE TABLE IF NOT EXISTS public.item_collection_manual_ownership (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES public.item_collections(id) ON DELETE CASCADE,
  item_id UUID NOT NULL,
  player_name TEXT NOT NULL,
  owned BOOLEAN NOT NULL DEFAULT true,
  set_by TEXT,
  set_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(collection_id, item_id, player_name)
);

ALTER TABLE public.item_collection_manual_ownership ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_manual_ownership_collection ON public.item_collection_manual_ownership (collection_id);

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'manual_ownership_select' AND tablename = 'item_collection_manual_ownership') THEN CREATE POLICY "manual_ownership_select" ON public.item_collection_manual_ownership FOR SELECT USING (collection_id IN (SELECT id FROM public.item_collections WHERE server_id IN (SELECT id FROM public.servers))); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'manual_ownership_insert' AND tablename = 'item_collection_manual_ownership') THEN CREATE POLICY "manual_ownership_insert" ON public.item_collection_manual_ownership FOR INSERT WITH CHECK (collection_id IN (SELECT id FROM public.item_collections WHERE server_id IN (SELECT id FROM public.servers))); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'manual_ownership_delete' AND tablename = 'item_collection_manual_ownership') THEN CREATE POLICY "manual_ownership_delete" ON public.item_collection_manual_ownership FOR DELETE USING (collection_id IN (SELECT id FROM public.item_collections WHERE server_id IN (SELECT id FROM public.servers))); END IF; END $$;
