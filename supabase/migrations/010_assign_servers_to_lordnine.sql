-- Assign specified servers to the LordNine: Infinite Class game
-- Run this in Supabase SQL Editor

DO $$
DECLARE
  v_game_id UUID;
BEGIN
  -- Find the LordNine game
  SELECT id INTO v_game_id FROM games WHERE name ILIKE '%lordnine%' LIMIT 1;

  IF v_game_id IS NULL THEN
    RAISE EXCEPTION 'Game "LordNine: Infinite Class" not found in games table';
  END IF;

  -- Update all listed servers
  UPDATE servers
  SET game_id = v_game_id
  WHERE name IN (
    'Yvonne 2',
    'Yvonne 1',
    'Pay to Win',
    'Ricardo 4',
    'Horatio2',
    'Y7',
    'Medea 4 - Divine',
    'Yvonne 6'
  );

  RAISE NOTICE 'Updated % servers to LordNine (game_id: %)', FOUND, v_game_id;
END $$;
