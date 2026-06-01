-- 014_spawn_notifications: Dedup table for cron-based spawn alerts
-- Ensures boss_spawning (5-min warning) and boss_spawned (spawn now)
-- fire exactly once per spawn cycle, even across bot restarts.

CREATE TABLE IF NOT EXISTS public.spawn_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  boss_id UUID NOT NULL REFERENCES public.bosses(id) ON DELETE CASCADE,
  event TEXT NOT NULL CHECK (event IN ('boss_spawning', 'boss_spawned')),
  spawn_timestamp BIGINT NOT NULL, -- Unix seconds of the calculated next spawn time
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (server_id, boss_id, event, spawn_timestamp)
);

CREATE INDEX IF NOT EXISTS idx_spawn_notifs_created_at ON public.spawn_notifications(created_at);

-- Enable RLS but allow service_role full access (bot uses service_role key)
ALTER TABLE public.spawn_notifications ENABLE ROW LEVEL SECURITY;
