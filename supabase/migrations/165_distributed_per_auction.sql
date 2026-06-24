-- 165: Track distributed per auction_id (not just item_id + round)
-- Multiple auctions of same item in same round need independent distribution tracking.

-- Add auction_id column
ALTER TABLE public.dkp_distributed ADD COLUMN IF NOT EXISTS auction_id UUID;

-- Clear existing distributed records (no auction_id to map them to specific auctions)
DELETE FROM public.dkp_distributed WHERE auction_id IS NULL;

-- Drop old PK and add new one with auction_id
ALTER TABLE public.dkp_distributed DROP CONSTRAINT IF EXISTS dkp_distributed_pkey;
ALTER TABLE public.dkp_distributed ADD PRIMARY KEY (item_id, auction_round, auction_id);

-- Updated toggle RPC: use auction_id for per-auction tracking
DROP FUNCTION IF EXISTS public.toggle_item_distributed(UUID, INTEGER, BOOLEAN);
CREATE OR REPLACE FUNCTION public.toggle_item_distributed(
  p_item_id UUID,
  p_auction_round INTEGER,
  p_auction_id UUID,
  p_distributed BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_distributed THEN
    INSERT INTO public.dkp_distributed (item_id, auction_round, auction_id)
    VALUES (p_item_id, p_auction_round, p_auction_id)
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.dkp_distributed
    WHERE item_id = p_item_id AND auction_round = p_auction_round AND auction_id = p_auction_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_item_distributed(UUID, INTEGER, UUID, BOOLEAN) TO authenticated;

-- Updated get_distributed_status: include auction_id in results
DROP FUNCTION IF EXISTS public.get_distributed_status(UUID[]);
CREATE OR REPLACE FUNCTION public.get_distributed_status(p_item_ids UUID[])
RETURNS TABLE(item_id UUID, auction_round INTEGER, auction_id UUID)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT d.item_id, d.auction_round, d.auction_id
  FROM public.dkp_distributed d
  WHERE d.item_id = ANY(p_item_ids);
$$;

GRANT EXECUTE ON FUNCTION public.get_distributed_status(UUID[]) TO authenticated;
