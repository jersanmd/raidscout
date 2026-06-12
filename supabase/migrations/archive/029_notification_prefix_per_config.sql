-- 029: Per-config notification prefix
-- Each Discord config can have its own ping prefix (e.g., @Raiders, @everyone)
-- Falls back to servers.notification_prefix if not set on the config.

ALTER TABLE discord_configs
ADD COLUMN IF NOT EXISTS notification_prefix TEXT;

COMMENT ON COLUMN discord_configs.notification_prefix IS
  'Per-config ping prefix (e.g., @everyone, @Raiders). Overrides server-level prefix.';
