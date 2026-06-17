-- Add sort_order to item_collection_items for drag-to-reorder
ALTER TABLE public.item_collection_items ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- Index for ordered queries
CREATE INDEX IF NOT EXISTS idx_collection_items_sort ON public.item_collection_items (collection_id, sort_order);
