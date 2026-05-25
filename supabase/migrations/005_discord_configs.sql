-- ── Discord Bot Configuration ──────────────────────────────
-- Maps Discord guild (server) IDs to RaidScout server IDs.
-- Allows a single Discord bot to serve multiple RaidScout servers.

CREATE TABLE IF NOT EXISTS discord_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_guild_id TEXT NOT NULL UNIQUE,
  raidscout_server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(discord_guild_id, raidscout_server_id)
);

ALTER TABLE discord_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage discord_configs" ON discord_configs
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ));
