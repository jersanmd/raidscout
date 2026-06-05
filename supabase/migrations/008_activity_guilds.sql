-- 008_activity_guilds.sql
-- Activity guild rotation assignments (mirrors boss_guilds)

CREATE TABLE IF NOT EXISTS activity_guilds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  sort_order INTEGER,
  day_of_week INTEGER,
  mode TEXT NOT NULL DEFAULT 'rotation' CHECK (mode IN ('rotation','daily','schedule','all')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(activity_id, guild_id)
);

ALTER TABLE activity_guilds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Server members can read activity_guilds" ON activity_guilds;
CREATE POLICY "Server members can read activity_guilds" ON activity_guilds 
  FOR SELECT TO authenticated 
  USING (EXISTS (
    SELECT 1 FROM activities WHERE id = activity_guilds.activity_id 
    AND EXISTS (SELECT 1 FROM server_members WHERE server_id = activities.server_id AND user_id = auth.uid())
  ));

DROP POLICY IF EXISTS "Server moderators can manage activity_guilds" ON activity_guilds;
CREATE POLICY "Server moderators can manage activity_guilds" ON activity_guilds 
  FOR ALL TO authenticated 
  USING (EXISTS (
    SELECT 1 FROM activities a JOIN server_members sm ON sm.server_id = a.server_id 
    WHERE a.id = activity_guilds.activity_id AND sm.user_id = auth.uid() AND sm.role IN ('owner','moderator')
  ));

DROP POLICY IF EXISTS "Admins can manage all activity_guilds" ON activity_guilds;
CREATE POLICY "Admins can manage all activity_guilds" ON activity_guilds
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE INDEX activity_guilds_activity_idx ON activity_guilds(activity_id);
CREATE INDEX activity_guilds_guild_idx ON activity_guilds(guild_id);
