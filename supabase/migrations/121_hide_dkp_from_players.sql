-- 121: Add hide_from_players to dkp_config
ALTER TABLE public.dkp_config ADD COLUMN IF NOT EXISTS hide_from_players BOOLEAN NOT NULL DEFAULT false;
