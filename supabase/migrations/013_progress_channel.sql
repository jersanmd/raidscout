-- Migration 013: Add progress_channel_id to discord_configs
-- Used by the "Demand Update" button to create progress report threads

ALTER TABLE public.discord_configs
  ADD COLUMN IF NOT EXISTS progress_channel_id TEXT;
