-- 106_boss_rotation_rpcs.sql
-- RPCs for advancing/setting boss rotation_counter
-- These were missing — the frontend called them but they didn't exist

-- Advance rotation_counter by 1 for rotation-mode bosses only.
-- Daily/schedule mode bosses are NOT affected — their rotation is computed
-- from death record dates, not from a counter.
CREATE OR REPLACE FUNCTION public.advance_boss_rotation(p_boss_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_mode TEXT;
  v_counter INTEGER;
BEGIN
  -- Check if boss has any rotation-mode guild assignments
  SELECT bg.mode INTO v_mode
  FROM public.boss_guilds bg
  WHERE bg.boss_id = p_boss_id AND bg.mode = 'rotation'
  LIMIT 1;

  IF v_mode IS NULL THEN
    -- Not a rotation-mode boss — do nothing, just return current counter
    SELECT COALESCE(rotation_counter, 1) INTO v_counter
    FROM public.bosses WHERE id = p_boss_id;
    RETURN v_counter;
  END IF;

  -- Increment counter for rotation-mode boss
  UPDATE public.bosses
  SET rotation_counter = COALESCE(rotation_counter, 1) + 1
  WHERE id = p_boss_id
  RETURNING rotation_counter INTO v_counter;

  RETURN v_counter;
END;
$$;

-- Set rotation_counter to a specific 1-based index
CREATE OR REPLACE FUNCTION public.set_boss_rotation(p_boss_id UUID, p_index INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_counter INTEGER;
BEGIN
  UPDATE public.bosses
  SET rotation_counter = GREATEST(p_index, 1)
  WHERE id = p_boss_id
  RETURNING rotation_counter INTO v_counter;

  RETURN v_counter;
END;
$$;
