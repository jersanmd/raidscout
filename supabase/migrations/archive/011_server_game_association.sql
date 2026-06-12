-- 011_server_game_association: Link servers to games, extend bosses/death_records
-- Depends on 009 (games + templates) and 010 (activities).

-- Add game_id to servers
ALTER TABLE public.servers ADD COLUMN IF NOT EXISTS game_id UUID REFERENCES public.games(id) ON DELETE SET NULL;
-- Backfill existing servers with LordNine game
UPDATE public.servers SET game_id = '00000000-0000-0000-0000-000000000001' WHERE game_id IS NULL;

-- Extend bosses
ALTER TABLE public.bosses ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.boss_templates(id) ON DELETE SET NULL;
ALTER TABLE public.bosses ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.bosses ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.bosses ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.bosses ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE public.bosses ADD COLUMN IF NOT EXISTS is_custom BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.bosses ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 1;

-- Backfill existing bosses with template_id (match by name)
UPDATE public.bosses b
SET template_id = bt.id
FROM public.boss_templates bt
WHERE b.name = bt.name AND bt.game_id = '00000000-0000-0000-0000-000000000001';

-- Extend death_records for one-time bosses
ALTER TABLE public.death_records ADD COLUMN IF NOT EXISTS is_final BOOLEAN NOT NULL DEFAULT false;

-- Extend spawn_notifications for activity dedup
ALTER TABLE public.spawn_notifications ADD COLUMN IF NOT EXISTS activity_id UUID REFERENCES public.activities(id) ON DELETE CASCADE;
ALTER TABLE public.spawn_notifications ADD CONSTRAINT spawn_notifs_one_target CHECK (
  (boss_id IS NOT NULL AND activity_id IS NULL) OR (boss_id IS NULL AND activity_id IS NOT NULL)
);

-- Replace the UNIQUE constraint with partial indexes (handles nullable boss_id/activity_id)
ALTER TABLE public.spawn_notifications DROP CONSTRAINT IF EXISTS spawn_notifications_server_id_boss_id_event_spawn_timestamp_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_spawn_notifs_boss ON public.spawn_notifications(server_id, boss_id, event, spawn_timestamp) WHERE boss_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_spawn_notifs_activity ON public.spawn_notifications(server_id, activity_id, event, spawn_timestamp) WHERE activity_id IS NOT NULL;
