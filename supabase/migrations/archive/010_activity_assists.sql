CREATE TABLE IF NOT EXISTS activity_assists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  owner_guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  assistant_guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(activity_id, owner_guild_id, assistant_guild_id)
);

ALTER TABLE activity_assists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Server members can read activity_assists" ON activity_assists;
CREATE POLICY "Server members can read activity_assists" ON activity_assists 
  FOR SELECT TO authenticated 
  USING (EXISTS (SELECT 1 FROM server_members WHERE server_id = activity_assists.server_id AND user_id = auth.uid()));

DROP POLICY IF EXISTS "Server moderators can manage activity_assists" ON activity_assists;
CREATE POLICY "Server moderators can manage activity_assists" ON activity_assists 
  FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM server_members WHERE server_id = activity_assists.server_id AND user_id = auth.uid() AND role IN ('owner','moderator')));

CREATE INDEX activity_assists_activity_idx ON activity_assists(activity_id);
CREATE INDEX activity_assists_server_idx ON activity_assists(server_id);
