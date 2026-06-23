-- 123: Add dkp_distributed flag to items for tracking loot handouts after auction
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS dkp_distributed BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_items_dkp_distributed ON public.items(id, server_id) WHERE dkp_distributed = false;

-- RPC to toggle distributed status (staff only, or SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.toggle_item_distributed(p_item_id UUID, p_distributed BOOLEAN)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.items SET dkp_distributed = p_distributed WHERE id = p_item_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_item_distributed(UUID, BOOLEAN) TO authenticated;
