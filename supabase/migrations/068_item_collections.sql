-- Item Collections — server owners/moderators can group catalog items into themed collections
-- and track which players own each item (ownership matrix)

CREATE TABLE IF NOT EXISTS public.item_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.item_collection_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES public.item_collections(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(collection_id, item_id)
);

ALTER TABLE public.item_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_collection_items ENABLE ROW LEVEL SECURITY;

-- RLS: server-scoped
CREATE POLICY "collections_server_select" ON public.item_collections FOR SELECT USING (server_id IN (SELECT id FROM public.servers));
CREATE POLICY "collections_server_insert" ON public.item_collections FOR INSERT WITH CHECK (server_id IN (SELECT id FROM public.servers));
CREATE POLICY "collections_server_update" ON public.item_collections FOR UPDATE USING (server_id IN (SELECT id FROM public.servers));
CREATE POLICY "collections_server_delete" ON public.item_collections FOR DELETE USING (server_id IN (SELECT id FROM public.servers));

CREATE POLICY "collection_items_select" ON public.item_collection_items FOR SELECT USING (collection_id IN (SELECT id FROM public.item_collections WHERE server_id IN (SELECT id FROM public.servers)));
CREATE POLICY "collection_items_insert" ON public.item_collection_items FOR INSERT WITH CHECK (collection_id IN (SELECT id FROM public.item_collections WHERE server_id IN (SELECT id FROM public.servers)));
CREATE POLICY "collection_items_delete" ON public.item_collection_items FOR DELETE USING (collection_id IN (SELECT id FROM public.item_collections WHERE server_id IN (SELECT id FROM public.servers)));
