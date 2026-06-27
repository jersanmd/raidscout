-- Fix spawn_notifications CHECK constraint to include all event types the bot sends.
-- Previously fixed but was reverted. This migration is idempotent.
ALTER TABLE public.spawn_notifications DROP CONSTRAINT IF EXISTS spawn_notifications_event_check;
ALTER TABLE public.spawn_notifications ADD CONSTRAINT spawn_notifications_event_check CHECK (
  event IN ('boss_spawning', 'boss_spawned', 'boss_thread', 'activity_spawning', 'activity_started', 'activity_thread')
);
