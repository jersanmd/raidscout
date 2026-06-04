-- ── Multi-Server Prefix Support ───────────────────────────
-- Allows multiple RaidScout servers to link to one Discord guild,
-- each with its own command prefix (e.g. ";" vs "!" vs "$").

-- 1. Drop the single-server-per-guild constraint
ALTER TABLE discord_configs DROP CONSTRAINT IF EXISTS discord_configs_discord_guild_id_key;

-- 2. Add command_prefix column (default "!" for new rows)
ALTER TABLE discord_configs ADD COLUMN IF NOT EXISTS command_prefix TEXT NOT NULL DEFAULT '!';

-- 3. Each prefix can only be used once per Discord guild
ALTER TABLE discord_configs DROP CONSTRAINT IF EXISTS discord_configs_discord_guild_id_command_prefix_key;
ALTER TABLE discord_configs ADD CONSTRAINT discord_configs_discord_guild_id_command_prefix_key 
  UNIQUE (discord_guild_id, command_prefix);

-- 4. Add notification_channel_id if not already present
ALTER TABLE discord_configs ADD COLUMN IF NOT EXISTS notification_channel_id TEXT;

-- 5. Update existing rows (which had ";" hardcoded) to use ";" prefix
--    so they don't break. New servers will default to "!".
UPDATE discord_configs SET command_prefix = ';' WHERE command_prefix = '!';
