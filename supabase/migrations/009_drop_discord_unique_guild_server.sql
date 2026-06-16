-- Drop composite unique constraint on (discord_guild_id, raidscout_server_id)
-- Allows linking the same Discord server to the same RaidScout server
-- with different command prefixes (bot resolves by guild_id + prefix)
ALTER TABLE discord_configs DROP CONSTRAINT IF EXISTS discord_configs_discord_guild_id_raidscout_server_id_key;
