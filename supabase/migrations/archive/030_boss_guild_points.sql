-- 030_boss_guild_points.sql
-- Per-guild boss points and salary overrides

ALTER TABLE public.boss_guilds ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT NULL;
ALTER TABLE public.boss_guilds ADD COLUMN IF NOT EXISTS has_salary BOOLEAN DEFAULT false;
