-- 000_core_tables.sql
-- Core infrastructure tables. MUST run before all other migrations.

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Servers Table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  invite_code TEXT,
  discord_webhook_url TEXT,
  viewer_key UUID DEFAULT gen_random_uuid(),
  timezone TEXT DEFAULT 'Asia/Manila',
  notification_prefix TEXT DEFAULT '@everyone',
  viewer_can_edit BOOLEAN NOT NULL DEFAULT false,
  viewer_can_mark_died BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS servers_owner_idx ON servers(owner_id);

-- ── Server Members Table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS server_members (
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'moderator' CHECK (role IN ('owner','moderator')),
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (server_id, user_id)
);

-- ── User Roles Table (platform-level admin) ─────────────────
CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Guilds Table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guilds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(name, server_id)
);

CREATE INDEX IF NOT EXISTS guilds_server_idx ON guilds(server_id);

-- ── Admin Audit Log ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  server_id UUID REFERENCES servers(id) ON DELETE SET NULL,
  viewer_key TEXT
);

-- ── App Settings Table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  server_id UUID REFERENCES servers(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS app_settings_pkey
  ON app_settings(key, COALESCE(server_id, '00000000-0000-0000-0000-000000000000'));

-- ── Discord Configs Table ───────────────────────────────────
CREATE TABLE IF NOT EXISTS discord_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_guild_id TEXT NOT NULL UNIQUE,
  raidscout_server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  label TEXT,
  webhook_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(discord_guild_id, raidscout_server_id)
);

ALTER TABLE discord_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage discord_configs" ON discord_configs;
CREATE POLICY "Users can manage discord_configs" ON discord_configs
  FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ═══════════════════════════════════════════════════════════
-- RLS Policies for core tables
-- ═══════════════════════════════════════════════════════════

-- ── servers ──────────────────────────────────────────────────
ALTER TABLE servers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Server members can read their server" ON servers
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM server_members WHERE server_id = servers.id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Server owners can update their server" ON servers
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM server_members WHERE server_id = servers.id AND user_id = auth.uid() AND role = 'owner')
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Server owners can delete their server" ON servers
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM server_members WHERE server_id = servers.id AND user_id = auth.uid() AND role = 'owner')
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Authenticated users can create servers" ON servers
  FOR INSERT TO authenticated WITH CHECK (true);

-- ── server_members ──────────────────────────────────────────
ALTER TABLE server_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Server members can read memberships" ON server_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM server_members sm WHERE sm.server_id = server_members.server_id AND sm.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Server owners can manage memberships" ON server_members
  FOR ALL USING (
    EXISTS (SELECT 1 FROM server_members WHERE server_id = server_members.server_id AND user_id = auth.uid() AND role = 'owner')
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- ── user_roles ──────────────────────────────────────────────
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own role" ON user_roles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins can read roles" ON user_roles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can manage roles" ON user_roles
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update roles" ON user_roles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can delete roles" ON user_roles
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- ── guilds ──────────────────────────────────────────────────
ALTER TABLE guilds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Server members can read guilds" ON guilds
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM server_members WHERE server_id = guilds.server_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Server moderators can manage guilds" ON guilds
  FOR ALL USING (
    EXISTS (SELECT 1 FROM server_members WHERE server_id = guilds.server_id AND user_id = auth.uid() AND role IN ('owner','moderator'))
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM server_members WHERE server_id = guilds.server_id AND user_id = auth.uid() AND role IN ('owner','moderator'))
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- ── admin_audit_log ─────────────────────────────────────────
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read audit log" ON admin_audit_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Authenticated users can insert audit entries" ON admin_audit_log
  FOR INSERT TO authenticated WITH CHECK (true);

-- ── app_settings ────────────────────────────────────────────
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read app settings" ON app_settings
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage app settings" ON app_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
