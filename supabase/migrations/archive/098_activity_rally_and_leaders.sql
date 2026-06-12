-- 098_activity_rally_and_leaders: Add rally_images and party_leaders to activity_instances

ALTER TABLE public.activity_instances
  ADD COLUMN IF NOT EXISTS rally_images TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS party_leaders JSONB DEFAULT '{}'::jsonb;

-- RPC: update rally images for an activity instance
CREATE OR REPLACE FUNCTION public.set_activity_rally_images(
  p_activity_instance_id UUID,
  p_images TEXT[]
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.activity_instances
  SET rally_images = p_images
  WHERE id = p_activity_instance_id;
$$;

GRANT EXECUTE ON FUNCTION public.set_activity_rally_images(UUID, TEXT[]) TO authenticated;

-- RPC: update party leaders for an activity instance
CREATE OR REPLACE FUNCTION public.set_activity_party_leaders(
  p_activity_instance_id UUID,
  p_leaders JSONB
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.activity_instances
  SET party_leaders = p_leaders
  WHERE id = p_activity_instance_id;
$$;

GRANT EXECUTE ON FUNCTION public.set_activity_party_leaders(UUID, JSONB) TO authenticated;
