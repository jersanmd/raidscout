-- 028: Auto-create threads in Discord channels
-- Adds thread channel config to discord_configs so per-guild thread creation
-- can be toggled for each linked Discord server.

ALTER TABLE discord_configs
ADD COLUMN IF NOT EXISTS thread_channel_id TEXT;

ALTER TABLE discord_configs
ADD COLUMN IF NOT EXISTS thread_guilds JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN discord_configs.thread_channel_id IS
  'Discord channel ID where spawn threads are auto-created 5 min before boss spawn';

COMMENT ON COLUMN discord_configs.thread_guilds IS
  'Array of guild UUIDs whose bosses trigger thread creation in this config';
