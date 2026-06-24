-- Backfill servers.game from games.slug where game_id is set but game is NULL
-- This fixes DKP MarkModal item search for servers that rely on game_id instead of game column
UPDATE public.servers s
SET game = g.slug
FROM public.games g
WHERE s.game_id = g.id
  AND s.game IS NULL
  AND g.slug IS NOT NULL;
