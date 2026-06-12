-- 002b_schema_fixes.sql
-- Columns, tables, and constraints that depend on 001 (bosses) + 002 (members).
-- Was originally created in the Supabase dashboard but never tracked in migrations.

-- ── Missing columns on bosses ──────────────────────────────
ALTER TABLE bosses
  ADD COLUMN IF NOT EXISTS server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS boss_points INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS rotation_counter INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS rotation_adjustment INTEGER;

CREATE INDEX IF NOT EXISTS bosses_server_id_idx ON bosses(server_id);

-- ── Missing columns on death_records ───────────────────────
ALTER TABLE death_records
  ADD COLUMN IF NOT EXISTS server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS owner_guild_id UUID REFERENCES guilds(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_initial_spawn BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS display_owner_guild_id UUID REFERENCES guilds(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS death_records_server_id_idx ON death_records(server_id);

-- ── Relax user_id constraint on death_records (viewer writes) ─
ALTER TABLE death_records ALTER COLUMN user_id DROP NOT NULL;

-- ── Missing columns on members ──────────────────────────────
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS guild_id UUID REFERENCES guilds(id) ON DELETE SET NULL;

-- Drop the unique constraint on name (now scoped per server)
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS members_name_server_idx ON members(name, server_id);

CREATE INDEX IF NOT EXISTS members_server_id_idx ON members(server_id);
CREATE INDEX IF NOT EXISTS members_guild_id_idx ON members(guild_id);

-- ── Missing column on attendance_records ────────────────────
ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS server_id UUID REFERENCES servers(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS attendance_records_server_idx ON attendance_records(server_id);

-- ── Boss Guilds Table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS boss_guilds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boss_id UUID NOT NULL REFERENCES bosses(id) ON DELETE CASCADE,
  guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  sort_order INTEGER,
  day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6),
  mode TEXT DEFAULT 'rotation' CHECK (mode IN ('rotation','schedule','daily'))
);

CREATE UNIQUE INDEX IF NOT EXISTS boss_guilds_unique_idx
  ON boss_guilds(boss_id, guild_id, COALESCE(day_of_week, -1));

CREATE INDEX IF NOT EXISTS boss_guilds_boss_idx ON boss_guilds(boss_id);
CREATE INDEX IF NOT EXISTS boss_guilds_guild_idx ON boss_guilds(guild_id);

ALTER TABLE boss_guilds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Server members can read boss guilds" ON boss_guilds
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM bosses b
      JOIN server_members sm ON sm.server_id = b.server_id
      WHERE b.id = boss_guilds.boss_id AND sm.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Server moderators can manage boss guilds" ON boss_guilds
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM bosses b
      JOIN server_members sm ON sm.server_id = b.server_id
      WHERE b.id = boss_guilds.boss_id AND sm.user_id = auth.uid() AND sm.role IN ('owner','moderator')
    )
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM bosses b
      JOIN server_members sm ON sm.server_id = b.server_id
      WHERE b.id = boss_guilds.boss_id AND sm.user_id = auth.uid() AND sm.role IN ('owner','moderator')
    )
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- ── Point Adjustments Table ─────────────────────────────────
CREATE TABLE IF NOT EXISTS point_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  adjusted_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS point_adjustments_server_idx ON point_adjustments(server_id);

ALTER TABLE point_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Server members can read adjustments" ON point_adjustments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM server_members WHERE server_id = point_adjustments.server_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Server moderators can manage adjustments" ON point_adjustments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM server_members WHERE server_id = point_adjustments.server_id AND user_id = auth.uid() AND role IN ('owner','moderator'))
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM server_members WHERE server_id = point_adjustments.server_id AND user_id = auth.uid() AND role IN ('owner','moderator'))
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- ── Boss Spawn Overrides Table ──────────────────────────────
CREATE TABLE IF NOT EXISTS boss_spawn_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boss_id UUID NOT NULL REFERENCES bosses(id) ON DELETE CASCADE,
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  death_time TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(boss_id, server_id)
);

CREATE INDEX IF NOT EXISTS boss_spawn_overrides_server_idx ON boss_spawn_overrides(server_id);

ALTER TABLE boss_spawn_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Server members can read overrides" ON boss_spawn_overrides
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM server_members WHERE server_id = boss_spawn_overrides.server_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Server moderators can manage overrides" ON boss_spawn_overrides
  FOR ALL USING (
    EXISTS (SELECT 1 FROM server_members WHERE server_id = boss_spawn_overrides.server_id AND user_id = auth.uid() AND role IN ('owner','moderator'))
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM server_members WHERE server_id = boss_spawn_overrides.server_id AND user_id = auth.uid() AND role IN ('owner','moderator'))
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
