-- 009_games_and_templates: Foundation for multi-game support
-- Creates games table, boss_templates, and activity_templates.
-- Seeds LordNine game + 39 boss templates.

CREATE TABLE IF NOT EXISTS public.games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  icon_url TEXT,
  supported_spawn_types JSONB NOT NULL DEFAULT '["fixed_hours","fixed_schedule"]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.boss_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  spawn_type TEXT NOT NULL CHECK (spawn_type IN ('fixed_hours', 'fixed_schedule')),
  respawn_hours INTEGER,
  schedule JSONB,
  is_recurring BOOLEAN NOT NULL DEFAULT true,
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  points INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.activity_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  schedule_type TEXT NOT NULL CHECK (schedule_type IN ('recurring', 'one_time')),
  schedule JSONB,
  duration_minutes INTEGER,
  points_per_participant INTEGER NOT NULL DEFAULT 1,
  party_size INTEGER,
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: read by all authenticated, write by admins
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boss_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_templates ENABLE ROW LEVEL SECURITY;

-- Seed: LordNine game
INSERT INTO public.games (id, name, slug, supported_spawn_types)
VALUES ('00000000-0000-0000-0000-000000000001', 'LordNine: Infinite Class', 'lordnine', '["fixed_hours","fixed_schedule"]'::jsonb);

-- Seed: 39 boss templates for LordNine
INSERT INTO public.boss_templates (game_id, name, spawn_type, respawn_hours, schedule, is_recurring, points) VALUES
('00000000-0000-0000-0000-000000000001', 'Venatus', 'fixed_hours', 10, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Viorent', 'fixed_hours', 12, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Ego', 'fixed_hours', 21, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Clemantis', 'fixed_hours', 12, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Livera', 'fixed_hours', 8, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Araneo', 'fixed_hours', 14, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Undomiel', 'fixed_hours', 16, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Saphirus', 'fixed_hours', 18, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Neutro', 'fixed_hours', 20, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Lady Dalia', 'fixed_hours', 24, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'General Aquleus', 'fixed_hours', 24, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Thymele', 'fixed_hours', 12, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Amentis', 'fixed_hours', 10, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Baron', 'fixed_hours', 12, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Milavy', 'fixed_hours', 24, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Wannitas', 'fixed_hours', 48, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Metus', 'fixed_hours', 24, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Duplican', 'fixed_hours', 32, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Shuliar', 'fixed_hours', 36, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Ringor', 'fixed_hours', 48, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Roderick', 'fixed_hours', 62, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Gareth', 'fixed_hours', 24, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Auraq', 'fixed_schedule', NULL, '[{"day":5,"time":"22:00"},{"day":3,"time":"21:00"}]'::jsonb, true, 1),
('00000000-0000-0000-0000-000000000001', 'Benji', 'fixed_schedule', NULL, '[{"day":0,"time":"21:00"}]'::jsonb, true, 1),
('00000000-0000-0000-0000-000000000001', 'Chaiflock', 'fixed_schedule', NULL, '[{"day":0,"time":"15:00"}]'::jsonb, true, 1),
('00000000-0000-0000-0000-000000000001', 'Clemantis', 'fixed_schedule', NULL, '[{"day":1,"time":"11:30"},{"day":4,"time":"19:00"}]'::jsonb, true, 1),
('00000000-0000-0000-0000-000000000001', 'Icaruthia', 'fixed_schedule', NULL, '[{"day":2,"time":"21:00"},{"day":5,"time":"21:00"}]'::jsonb, true, 1),
('00000000-0000-0000-0000-000000000001', 'Libitina', 'fixed_schedule', NULL, '[{"day":1,"time":"21:00"},{"day":6,"time":"21:00"}]'::jsonb, true, 1),
('00000000-0000-0000-0000-000000000001', 'Lucus', 'fixed_schedule', NULL, '[{"day":6,"time":"22:00"}]'::jsonb, true, 1),
('00000000-0000-0000-0000-000000000001', 'Motti', 'fixed_schedule', NULL, '[{"day":2,"time":"22:00"}]'::jsonb, true, 1),
('00000000-0000-0000-0000-000000000001', 'Nevaeh', 'fixed_schedule', NULL, '[{"day":3,"time":"22:00"}]'::jsonb, true, 1),
('00000000-0000-0000-0000-000000000001', 'Ordo', 'fixed_schedule', NULL, '[{"day":4,"time":"22:00"},{"day":5,"time":"17:00"}]'::jsonb, true, 1),
('00000000-0000-0000-0000-000000000001', 'Rakajeth', 'fixed_schedule', NULL, '[{"day":6,"time":"20:00"},{"day":1,"time":"15:00"}]'::jsonb, true, 1),
('00000000-0000-0000-0000-000000000001', 'Secreta', 'fixed_schedule', NULL, '[{"day":2,"time":"20:00"},{"day":4,"time":"18:00"}]'::jsonb, true, 1),
('00000000-0000-0000-0000-000000000001', 'Supore', 'fixed_schedule', NULL, '[{"day":0,"time":"19:00"},{"day":3,"time":"14:00"}]'::jsonb, true, 1),
('00000000-0000-0000-0000-000000000001', 'Titore', 'fixed_schedule', NULL, '[{"day":0,"time":"18:00"}]'::jsonb, true, 1),
('00000000-0000-0000-0000-000000000001', 'Larba', 'fixed_schedule', NULL, '[{"day":2,"time":"18:00"}]'::jsonb, true, 1),
('00000000-0000-0000-0000-000000000001', 'Catena', 'fixed_schedule', NULL, '[{"day":3,"time":"15:00"},{"day":6,"time":"19:00"}]'::jsonb, true, 1),
('00000000-0000-0000-0000-000000000001', 'Tumier', 'fixed_schedule', NULL, '[{"day":5,"time":"15:00"}]'::jsonb, true, 1);
