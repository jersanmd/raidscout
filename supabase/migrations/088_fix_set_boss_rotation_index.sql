-- 088: Fix set_boss_rotation RPC — GREATES(p_index, 1) was mapping
-- both index 0 and index 1 to rotation_counter=1, causing the second
-- guild click to show the first guild. Use p_index + 1 instead.

CREATE OR REPLACE FUNCTION public.set_boss_rotation(p_boss_id UUID, p_index INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_counter INTEGER;
BEGIN
  UPDATE public.bosses
  SET rotation_counter = p_index + 1
  WHERE id = p_boss_id
  RETURNING rotation_counter INTO v_counter;

  RETURN v_counter;
END;
$$;
