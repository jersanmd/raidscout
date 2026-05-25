-- ── Discord Bot Configuration ──────────────────────────────
-- Maps Discord guild (server) IDs to RaidScout server IDs.
-- Allows a single Discord bot to serve multiple RaidScout servers.
-- Each entry can optionally include a webhook URL for notifications
-- and a label (e.g. guild name).

CREATE TABLE IF NOT EXISTS discord_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_guild_id TEXT NOT NULL UNIQUE,
  raidscout_server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  label TEXT,           -- e.g. "Crimson" guild name
  webhook_url TEXT,     -- per-guild Discord webhook for notifications
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(discord_guild_id, raidscout_server_id)
);

ALTER TABLE discord_configs ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can manage configs for servers they have access to.
-- The frontend scopes queries by raidscout_server_id.
CREATE POLICY "Users can manage discord_configs" ON discord_configs
  FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
