-- Add is_visible column to games table
-- Admins can toggle this to show/hide games in the Create Server page
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT true;
