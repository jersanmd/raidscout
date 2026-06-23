-- 125: Track distributed per auction round (not per item)
CREATE TABLE IF NOT EXISTS public.dkp_distributed (
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  auction_round INTEGER NOT NULL DEFAULT 1,
  distributed_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (item_id, auction_round)
);

-- Updated RPC: toggle distributed per round
DROP FUNCTION IF EXISTS public.toggle_item_distributed(uuid, boolean);
CREATE OR REPLACE FUNCTION public.toggle_item_distributed(
  p_item_id UUID,
  p_auction_round INTEGER,
  p_distributed BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_distributed THEN
    INSERT INTO public.dkp_distributed (item_id, auction_round)
    VALUES (p_item_id, p_auction_round)
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.dkp_distributed
    WHERE item_id = p_item_id AND auction_round = p_auction_round;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_item_distributed(UUID, INTEGER, BOOLEAN) TO authenticated;

-- Drop old per-item column (no longer needed)
ALTER TABLE public.items DROP COLUMN IF EXISTS dkp_distributed;

-- RPC to get distributed status for items
CREATE OR REPLACE FUNCTION public.get_distributed_status(p_item_ids UUID[])
RETURNS TABLE(item_id UUID, auction_round INTEGER)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT d.item_id, d.auction_round
  FROM public.dkp_distributed d
  WHERE d.item_id = ANY(p_item_ids);
$$;

GRANT EXECUTE ON FUNCTION public.get_distributed_status(UUID[]) TO authenticated;
