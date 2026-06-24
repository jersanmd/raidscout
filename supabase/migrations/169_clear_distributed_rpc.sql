-- 169: RPC to clear distributed status for an item (used when deleting distribution from inventory)
CREATE OR REPLACE FUNCTION public.clear_item_distributed(p_item_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM public.dkp_distributed WHERE item_id = p_item_id;
$$;

GRANT EXECUTE ON FUNCTION public.clear_item_distributed(UUID) TO authenticated;
