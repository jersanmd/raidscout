-- Consolidated Initial Schema for RaidScout
-- Generated: 2026-06-12T02:49:52.449Z
-- Tables: 25, Policies: 63, Functions: 39

-- ── Extensions ──
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── servers ──
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
-- Additional columns added over time:
-- ALTER TABLE servers ADD COLUMN if NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;

-- ── server_members ──
CREATE TABLE IF NOT EXISTS server_members (
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'moderator' CHECK (role IN ('owner','moderator')),
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (server_id, user_id)
);
ALTER TABLE public.server_members ENABLE ROW LEVEL SECURITY;

-- ── user_roles ──
CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ── guilds ──
CREATE TABLE IF NOT EXISTS guilds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(name, server_id)
);
ALTER TABLE public.guilds ENABLE ROW LEVEL SECURITY;

-- ── admin_audit_log ──
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
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- ── app_settings ──
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  server_id UUID REFERENCES servers(id) ON DELETE CASCADE
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- ── discord_configs ──
CREATE TABLE IF NOT EXISTS discord_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_guild_id TEXT NOT NULL UNIQUE,
  raidscout_server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  label TEXT,
  webhook_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(discord_guild_id, raidscout_server_id)
);
-- Additional columns added over time:
-- ALTER TABLE discord_configs ADD COLUMN if NOT EXISTS command_channel_id TEXT;
-- ALTER TABLE discord_configs ADD COLUMN constraint discord_configs_discord_guild_id_command_prefix_key 
  UNIQUE (discord_guild_id, command_prefix);
ALTER TABLE public.discord_configs ENABLE ROW LEVEL SECURITY;

-- ── bosses ──
create table if not exists bosses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  spawn_type text not null check (spawn_type in ('fixed_hours', 'fixed_schedule')),
  respawn_hours integer,
  schedule jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Additional columns added over time:
-- ALTER TABLE bosses ADD COLUMN if NOT EXISTS image_url TEXT;
ALTER TABLE public.bosses ENABLE ROW LEVEL SECURITY;

-- ── death_records ──
create table if not exists death_records (
  id uuid primary key default gen_random_uuid(),
  boss_id uuid not null references bosses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  death_time timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Additional columns added over time:
-- ALTER TABLE death_records ADD COLUMN if NOT EXISTS party_leaders JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.death_records ENABLE ROW LEVEL SECURITY;

-- ── members ──
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);
-- Additional columns added over time:
-- ALTER TABLE members ADD COLUMN if NOT EXISTS server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS guild_id UUID REFERENCES guilds(id) ON DELETE SET NULL;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

-- ── attendance_records ──
create table if not exists attendance_records (
  id uuid primary key default gen_random_uuid(),
  death_record_id uuid not null references death_records(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(death_record_id, member_id)
);
-- Additional columns added over time:
-- ALTER TABLE attendance_records ADD COLUMN if NOT EXISTS server_id UUID REFERENCES servers(id) ON DELETE CASCADE;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

-- ── boss_guilds ──
CREATE TABLE IF NOT EXISTS boss_guilds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boss_id UUID NOT NULL REFERENCES bosses(id) ON DELETE CASCADE,
  guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  sort_order INTEGER,
  day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6),
  mode TEXT DEFAULT 'rotation' CHECK (mode IN ('rotation','schedule','daily'))
);
ALTER TABLE public.boss_guilds ENABLE ROW LEVEL SECURITY;

-- ── point_adjustments ──
CREATE TABLE IF NOT EXISTS point_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  adjusted_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.point_adjustments ENABLE ROW LEVEL SECURITY;

-- ── boss_spawn_overrides ──
CREATE TABLE IF NOT EXISTS boss_spawn_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boss_id UUID NOT NULL REFERENCES bosses(id) ON DELETE CASCADE,
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  death_time TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(boss_id, server_id)
);
ALTER TABLE public.boss_spawn_overrides ENABLE ROW LEVEL SECURITY;

-- ── leaderboard_snapshots ──
create table if not exists leaderboard_snapshots (
  id uuid primary key default gen_random_uuid(),
  server_id uuid references public.servers(id),
  finalized_at timestamptz not null default now(),
  period_start timestamptz,
  period text not null check (period in ('all_time', 'weekly', 'monthly')),
  rankings jsonb not null,
  created_at timestamptz not null default now()
);
-- Additional columns added over time:
-- ALTER TABLE leaderboard_snapshots ADD COLUMN if NOT EXISTS server_id UUID REFERENCES public.servers(id);
ALTER TABLE public.leaderboard_snapshots ENABLE ROW LEVEL SECURITY;

-- ── spawn_notifications ──
CREATE TABLE IF NOT EXISTS public.spawn_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  boss_id UUID NOT NULL REFERENCES public.bosses(id) ON DELETE CASCADE,
  event TEXT NOT NULL CHECK (event IN ('boss_spawning', 'boss_spawned')),
  spawn_timestamp BIGINT NOT NULL, -- Unix seconds of the calculated next spawn time
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (server_id, boss_id, event, spawn_timestamp)
);
-- Additional columns added over time:
-- ALTER TABLE spawn_notifications ADD COLUMN if NOT EXISTS activity_id UUID REFERENCES public.activities(id) ON DELETE CASCADE;
-- ALTER TABLE spawn_notifications ADD COLUMN constraint spawn_notifs_one_target CHECK (
  (boss_id IS NOT NULL AND activity_id IS NULL) OR (boss_id IS NULL AND activity_id IS NOT NULL)
);
ALTER TABLE public.spawn_notifications ENABLE ROW LEVEL SECURITY;

-- ── games ──
CREATE TABLE IF NOT EXISTS public.games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  icon_url TEXT,
  supported_spawn_types JSONB NOT NULL DEFAULT '["fixed_hours","fixed_schedule"]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

-- ── boss_templates ──
CREATE TABLE IF NOT EXISTS public.boss_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  spawn_type TEXT NOT NULL CHECK (spawn_type IN ('fixed_hours', 'fixed_schedule')),
  respawn_hours INTEGER,
  schedule JSONB,
  is_recurring BOOLEAN NOT NULL DEFAULT true,
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  points INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.boss_templates ENABLE ROW LEVEL SECURITY;

-- ── activity_templates ──
CREATE TABLE IF NOT EXISTS public.activity_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  schedule_type TEXT NOT NULL CHECK (schedule_type IN ('recurring', 'one_time')),
  schedule JSONB,
  duration_minutes INTEGER,
  points_per_participant INTEGER NOT NULL DEFAULT 1,
  party_size INTEGER,
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.activity_templates ENABLE ROW LEVEL SECURITY;

-- ── activities ──
CREATE TABLE IF NOT EXISTS public.activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.activity_templates(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  schedule_type TEXT NOT NULL CHECK (schedule_type IN ('recurring', 'one_time')),
  schedule JSONB,
  duration_minutes INTEGER,
  points_per_participant INTEGER NOT NULL DEFAULT 1,
  party_size INTEGER,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  is_custom BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Additional columns added over time:
-- ALTER TABLE activities ADD COLUMN if NOT EXISTS image_url TEXT;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

-- ── activity_instances ──
CREATE TABLE IF NOT EXISTS public.activity_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.activity_instances ENABLE ROW LEVEL SECURITY;

-- ── activity_parties ──
CREATE TABLE IF NOT EXISTS public.activity_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_instance_id UUID NOT NULL REFERENCES public.activity_instances(id) ON DELETE CASCADE,
  party_number INTEGER NOT NULL,
  member_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (activity_instance_id, party_number)
);
ALTER TABLE public.activity_parties ENABLE ROW LEVEL SECURITY;

-- ── activity_attendance ──
CREATE TABLE IF NOT EXISTS public.activity_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_instance_id UUID NOT NULL REFERENCES public.activity_instances(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  present BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (activity_instance_id, member_id)
);
ALTER TABLE public.activity_attendance ENABLE ROW LEVEL SECURITY;

-- ── point_rules ──
CREATE TABLE IF NOT EXISTS public.point_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  guild_id UUID NOT NULL REFERENCES public.guilds(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL DEFAULT 'time_multiplier',
  config JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.point_rules ENABLE ROW LEVEL SECURITY;

-- ── boss_assists ──
CREATE TABLE IF NOT EXISTS public.boss_assists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boss_id UUID NOT NULL REFERENCES public.bosses(id) ON DELETE CASCADE,
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  guild_id UUID REFERENCES public.guilds(id) ON DELETE SET NULL,
  member_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.boss_assists ENABLE ROW LEVEL SECURITY;

-- ── Row Level Security Policies ──
CREATE POLICY "Users can manage discord_configs" ON discord_configs
  FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
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
CREATE POLICY "Admins can read audit log" ON admin_audit_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "Authenticated users can insert audit entries" ON admin_audit_log
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can read app settings" ON app_settings
  FOR SELECT USING (true);
CREATE POLICY "Admins can manage app settings" ON app_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
create policy "Authenticated users can read bosses"
  on bosses for select
  to authenticated
  using (true);
create policy "Users can read their own death records"
  on death_records for select
  to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can insert their own death records"
  on death_records for insert
  to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users can update their own death records"
  on death_records for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete their own death records"
  on death_records for delete
  to authenticated
  using ((select auth.uid()) = user_id);
create policy "Authenticated users can read members"
  on members for select
  to authenticated
  using (true);
create policy "Authenticated users can insert members"
  on members for insert
  to authenticated
  with check (true);
create policy "Authenticated users can update members"
  on members for update
  to authenticated
  using (true)
  with check (true);
create policy "Authenticated users can delete members"
  on members for delete
  to authenticated
  using (true);
create policy "Authenticated users can read attendance"
  on attendance_records for select
  to authenticated
  using (true);
create policy "Authenticated users can insert attendance"
  on attendance_records for insert
  to authenticated
  with check (true);
create policy "Authenticated users can delete attendance"
  on attendance_records for delete
  to authenticated
  using (true);
create policy "Authenticated users can read death records"
  on death_records for select
  to authenticated
  using (true);
create policy "Authenticated users can delete death records"
  on death_records for delete
  to authenticated
  using (true);
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
create policy "Authenticated users can read snapshots"
  on leaderboard_snapshots for select
  to authenticated
  using (true);
create policy "Authenticated users can insert snapshots"
  on leaderboard_snapshots for insert
  to authenticated
  with check (true);
CREATE POLICY "Users can manage discord_configs" ON discord_configs
  FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can read server names" ON public.servers
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read servers" ON public.servers
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can update servers" ON public.servers
  FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read memberships" ON public.server_members
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage memberships" ON public.server_members
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read guilds" ON public.guilds
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage guilds" ON public.guilds
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read bosses" ON public.bosses
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage bosses" ON public.bosses
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read death records" ON public.death_records
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read members" ON public.members
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read activities" ON public.activities FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read roles" ON public.user_roles
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read boss guilds" ON public.boss_guilds
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage boss guilds" ON public.boss_guilds
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read overrides" ON public.boss_spawn_overrides
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage overrides" ON public.boss_spawn_overrides
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read adjustments" ON public.point_adjustments
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Server moderators can manage activities" ON public.activities
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.server_members WHERE server_id = activities.server_id AND user_id = auth.uid() AND role IN ('owner','moderator'))
  );
CREATE POLICY "Server moderators can manage bosses" ON public.bosses
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.server_members WHERE server_id = bosses.server_id AND user_id = auth.uid() AND role IN ('owner','moderator'))
  );
CREATE POLICY "Authenticated users can read point rules" ON public.point_rules FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read boss assists" ON public.boss_assists FOR SELECT USING (auth.role() = 'authenticated');

-- ── Functions & RPCs ──
create or replace function update_updated_at()
returns trigger as $$

create or replace function update_updated_at()
returns trigger as $$

create or replace function get_user_id_by_email(user_email text)
returns uuid
language sql
security definer
set search_path = ''
as $$

create or replace function get_server_by_viewer_key(v_key text)
returns table(id uuid, name text)
language plpgsql
security definer
set search_path = ''
as $$

create or replace function viewer_insert_death_record(
  p_boss_id uuid,
  p_death_time timestamptz,
  p_server_id uuid,
  p_viewer_key text,
  p_owner_guild_id uuid default null
)
returns setof death_records
language plpgsql
security definer
set search_path = ''
as $$

create or replace function viewer_delete_death_record(
  p_death_record_id uuid,
  p_viewer_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$

create or replace function viewer_upsert_member(
  p_name text,
  p_server_id uuid,
  p_viewer_key text
)
returns setof members
language plpgsql
security definer
set search_path = ''
as $$

create or replace function viewer_add_attendance(
  p_death_record_id uuid,
  p_member_id uuid,
  p_viewer_key text
)
returns setof attendance_records
language plpgsql
security definer
set search_path = ''
as $$

create or replace function viewer_remove_attendance(
  p_attendance_id uuid,
  p_viewer_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$

CREATE OR REPLACE FUNCTION get_all_servers_with_counts()
RETURNS TABLE(
  id uuid,
  name text,
  owner_id uuid,
  created_at timestamptz,
  member_count bigint,
  raid_member_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$

CREATE OR REPLACE FUNCTION create_server_with_bosses(server_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$

CREATE OR REPLACE FUNCTION get_server_stats(p_server_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$

CREATE OR REPLACE FUNCTION get_analytics(
  since TEXT,
  s_id UUID DEFAULT NULL,
  guild_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$

CREATE OR REPLACE FUNCTION public.create_server_with_bosses(
  p_name TEXT,
  p_game_id UUID,
  p_seed BOOLEAN DEFAULT true
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$

CREATE OR REPLACE FUNCTION public.get_leaderboard(
  p_server_id UUID,
  p_since TIMESTAMPTZ DEFAULT NULL,
  p_until TIMESTAMPTZ DEFAULT NULL
) RETURNS TABLE(
  member_id UUID,
  member_name TEXT,
  boss_points BIGINT,
  activity_points BIGINT,
  total_points BIGINT,
  boss_kills BIGINT,
  activities_attended BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$

CREATE OR REPLACE FUNCTION public.sync_boss_template()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$

CREATE OR REPLACE FUNCTION public.sync_activity_template()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$

CREATE OR REPLACE FUNCTION public.set_activity_parties(
  p_activity_instance_id UUID,
  p_parties JSONB -- [{party_number: 1, member_ids: [uuid, ...]}, ...]
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$

CREATE OR REPLACE FUNCTION public.mark_activity_attendance(
  p_activity_instance_id UUID,
  p_member_id UUID,
  p_present BOOLEAN DEFAULT true
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$

CREATE OR REPLACE FUNCTION public.viewer_get_activities(
  v_server_id UUID,
  v_key TEXT
) RETURNS SETOF public.activities
LANGUAGE plpgsql
SECURITY DEFINER
AS $$

CREATE OR REPLACE FUNCTION public.viewer_get_activity_instances(
  v_server_id UUID,
  v_key TEXT
) RETURNS TABLE(
  id UUID, activity_id UUID, start_time TIMESTAMPTZ, end_time TIMESTAMPTZ, created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$

CREATE OR REPLACE FUNCTION public.viewer_get_activity_parties(
  v_instance_id UUID,
  v_key TEXT
) RETURNS SETOF public.activity_parties
LANGUAGE plpgsql
SECURITY DEFINER
AS $$

CREATE OR REPLACE FUNCTION public.find_next_daily_slot(
  p_last_time TIMESTAMPTZ,
  p_time_str TEXT -- "HH:MM"
) RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
IMMUTABLE
AS $$

CREATE OR REPLACE FUNCTION public.create_server_with_bosses(
  p_name TEXT,
  p_game_id UUID,
  p_seed BOOLEAN DEFAULT true,
  p_guild_name TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$

CREATE OR REPLACE FUNCTION public.get_latest_deaths(p_server_id UUID)
RETURNS TABLE(boss_id UUID, death_time TIMESTAMPTZ, owner_guild_id UUID)
LANGUAGE sql
SECURITY DEFINER
AS $$

CREATE OR REPLACE FUNCTION public.get_public_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$

CREATE OR REPLACE FUNCTION public.seed_bosses_for_server(p_server_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$

CREATE OR REPLACE FUNCTION public.seed_activities_for_server(p_server_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$

CREATE OR REPLACE FUNCTION public.create_server_with_bosses(
  p_name TEXT,
  p_game_id UUID,
  p_seed BOOLEAN DEFAULT true,
  p_guild_name TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$

CREATE OR REPLACE FUNCTION public.seed_from_game(p_server_id UUID, p_game_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$

CREATE OR REPLACE FUNCTION public.get_server_members(p_server_id UUID)
RETURNS TABLE(user_id UUID, email TEXT, role TEXT)
LANGUAGE sql SECURITY DEFINER AS $$

CREATE OR REPLACE FUNCTION public.get_server_viewer_key(p_server_id UUID)
RETURNS TEXT
LANGUAGE sql SECURITY DEFINER AS $$

CREATE OR REPLACE FUNCTION public.delete_server_cascade(p_server_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$

CREATE OR REPLACE FUNCTION public.create_custom_boss(
  p_server_id UUID, p_name TEXT, p_spawn_type TEXT,
  p_respawn_hours INTEGER, p_schedule JSONB,
  p_is_recurring BOOLEAN, p_boss_points INTEGER,
  p_category TEXT, p_tags TEXT[]
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
AS $$

CREATE OR REPLACE FUNCTION public.create_custom_activity(
  p_server_id UUID, p_name TEXT, p_schedule_type TEXT,
  p_schedule JSONB, p_points_per_participant INTEGER,
  p_party_size INTEGER, p_category TEXT, p_tags TEXT[]
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
AS $$

CREATE OR REPLACE FUNCTION public.delete_server_cascade(p_server_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$

CREATE OR REPLACE FUNCTION public.create_custom_boss(
  p_server_id UUID, p_name TEXT, p_spawn_type TEXT,
  p_respawn_hours INTEGER DEFAULT NULL,
  p_schedule JSONB DEFAULT NULL,
  p_is_recurring BOOLEAN DEFAULT true,
  p_boss_points INTEGER DEFAULT 1,
  p_category TEXT DEFAULT NULL,
  p_tags TEXT[] DEFAULT '{}'
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
AS $$

CREATE OR REPLACE FUNCTION public.create_custom_activity(
  p_server_id UUID, p_name TEXT, p_schedule_type TEXT,
  p_schedule JSONB DEFAULT NULL,
  p_points_per_participant INTEGER DEFAULT 1,
  p_party_size INTEGER DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_tags TEXT[] DEFAULT '{}'
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
AS $$

-- ── RPC Grants ──
GRANT EXECUTE ON FUNCTION get_all_servers_with_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION create_server_with_bosses(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_stats() TO anon, authenticated;

-- ── Indexes, Triggers & Other ──
CREATE INDEX IF NOT EXISTS servers_owner_idx ON servers(owner_id);
CREATE INDEX IF NOT EXISTS guilds_server_idx ON guilds(server_id);
CREATE UNIQUE INDEX IF NOT EXISTS app_settings_pkey
  ON app_settings(key, COALESCE(server_id, '00000000-0000-0000-0000-000000000000'));
DROP POLICY IF EXISTS "Users can manage discord_configs" ON discord_configs;
create index if not exists bosses_spawn_type_idx on bosses(spawn_type);
create index if not exists death_records_user_id_idx on death_records(user_id);
create index if not exists death_records_boss_id_idx on death_records(boss_id);
create index if not exists death_records_user_boss_idx on death_records(user_id, boss_id);
begin
  new.updated_at = now();
return new;
$$ language plpgsql;
create index if not exists members_name_idx on members(name);
create index if not exists attendance_death_record_idx on attendance_records(death_record_id);
create index if not exists attendance_member_idx on attendance_records(member_id);
drop policy if exists "Users can read their own death records" on death_records;
drop policy if exists "Users can delete their own death records" on death_records;
create or replace view leaderboard as
select
  m.id,
  m.name,
  count(ar.id)::int as points,
  max(ar.created_at) as last_attended
from members m
left join attendance_records ar on ar.member_id = m.id
group by m.id, m.name
order by points desc, last_attended desc nulls last;
CREATE INDEX IF NOT EXISTS bosses_server_id_idx ON bosses(server_id);
CREATE INDEX IF NOT EXISTS death_records_server_id_idx ON death_records(server_id);
ALTER TABLE death_records ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS members_name_server_idx ON members(name, server_id);
CREATE INDEX IF NOT EXISTS members_server_id_idx ON members(server_id);
CREATE INDEX IF NOT EXISTS members_guild_id_idx ON members(guild_id);
CREATE INDEX IF NOT EXISTS attendance_records_server_idx ON attendance_records(server_id);
CREATE UNIQUE INDEX IF NOT EXISTS boss_guilds_unique_idx
  ON boss_guilds(boss_id, guild_id, COALESCE(day_of_week, -1));
CREATE INDEX IF NOT EXISTS boss_guilds_boss_idx ON boss_guilds(boss_id);
CREATE INDEX IF NOT EXISTS boss_guilds_guild_idx ON boss_guilds(guild_id);
CREATE INDEX IF NOT EXISTS point_adjustments_server_idx ON point_adjustments(server_id);
CREATE INDEX IF NOT EXISTS boss_spawn_overrides_server_idx ON boss_spawn_overrides(server_id);
create index if not exists leaderboard_snapshots_period_idx on leaderboard_snapshots(period);
create index if not exists leaderboard_snapshots_finalized_idx on leaderboard_snapshots(finalized_at desc);
create index if not exists idx_leaderboard_snapshots_server on leaderboard_snapshots(server_id);
begin
  new.updated_at = now();
return new;
$$ language plpgsql;
select id from auth.users where email = user_email limit 1;
grant execute on function get_user_id_by_email(text) to authenticated;
begin
  return query
    select s.id, s.name
    from servers s
    where s.invite_code = v_key;
grant execute on function get_server_by_viewer_key(text) to anon, authenticated;
declare
  v_server_id uuid;
begin
  -- Validate viewer key
  select id into v_server_id from servers where invite_code = p_viewer_key;
if v_server_id is null or v_server_id <> p_server_id then
    raise exception 'Invalid viewer key';
end if;
grant execute on function viewer_insert_death_record(uuid, timestamptz, uuid, text, uuid) to anon, authenticated;
declare
  v_server_id uuid;
begin
  -- Validate viewer key against the death record's server
  select server_id into v_server_id from death_records where id = p_death_record_id;
if not exists (select 1 from servers where invite_code = p_viewer_key and id = v_server_id) then
    raise exception 'Invalid viewer key';
end if;
delete from death_records where id = p_death_record_id;
grant execute on function viewer_delete_death_record(uuid, text) to anon, authenticated;
declare
  v_server_id uuid;
v_member_id uuid;
begin
  -- Validate viewer key
  select id into v_server_id from servers where invite_code = p_viewer_key;
if v_server_id is null or v_server_id <> p_server_id then
    raise exception 'Invalid viewer key';
end if;
select id into v_member_id from members where name = p_name;
else
    return query select * from members where id = v_member_id;
end if;
grant execute on function viewer_upsert_member(text, uuid, text) to anon, authenticated;
declare
  v_server_id uuid;
begin
  -- Validate viewer key against the death record's server
  select server_id into v_server_id from death_records where id = p_death_record_id;
if not exists (select 1 from servers where invite_code = p_viewer_key and id = v_server_id) then
    raise exception 'Invalid viewer key';
end if;
grant execute on function viewer_add_attendance(uuid, uuid, text) to anon, authenticated;
declare
  v_server_id uuid;
begin
  -- Validate viewer key against the attendance record's server
  select dr.server_id into v_server_id
  from attendance_records ar
  join death_records dr on dr.id = ar.death_record_id
  where ar.id = p_attendance_id;
if not exists (select 1 from servers where invite_code = p_viewer_key and id = v_server_id) then
    raise exception 'Invalid viewer key';
end if;
delete from attendance_records where id = p_attendance_id;
grant execute on function viewer_remove_attendance(uuid, text) to anon, authenticated;
CREATE INDEX IF NOT EXISTS idx_spawn_notifs_created_at ON public.spawn_notifications(created_at);
ALTER TABLE discord_configs DROP CONSTRAINT IF EXISTS discord_configs_discord_guild_id_key;
ALTER TABLE discord_configs DROP CONSTRAINT IF EXISTS discord_configs_discord_guild_id_command_prefix_key;
UPDATE discord_configs SET command_prefix = ';' WHERE command_prefix = '!';
DROP POLICY IF EXISTS "Users can manage discord_configs" ON discord_configs;
DROP FUNCTION IF EXISTS get_all_servers_with_counts();
SELECT 
    s.id,
    s.name,
    s.owner_id,
    s.created_at,
    (SELECT COUNT(*) FROM public.server_members sm WHERE sm.server_id = s.id) AS member_count,
    (SELECT COUNT(*) FROM public.members m WHERE m.server_id = s.id) AS raid_member_count
  FROM public.servers s
  ORDER BY s.created_at DESC;
DECLARE
  srv_id UUID;
invite TEXT;
BEGIN
  invite := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));
RETURN jsonb_build_object('id', srv_id, 'name', server_name, 'invite_code', invite);
SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
  );
DECLARE
  result JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin only';
END IF;
SELECT jsonb_build_object(
    'member_count', (SELECT COUNT(*) FROM public.server_members WHERE server_id = p_server_id),
    'boss_count', (SELECT COUNT(*) FROM public.bosses WHERE server_id = p_server_id),
    'death_count', (SELECT COUNT(*) FROM public.death_records WHERE server_id = p_server_id),
    'has_webhook', (SELECT discord_webhook_url IS NOT NULL AND discord_webhook_url != '' FROM public.servers WHERE id = p_server_id),
    'guild_members', (
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT COALESCE(g.name, 'No Guild') AS guild, COUNT(m.id) AS count
        FROM public.guilds g
        LEFT JOIN public.members m ON m.guild_id = g.id AND m.server_id = p_server_id
        WHERE g.server_id = p_server_id
        GROUP BY g.name
        UNION ALL
        SELECT 'No Guild', COUNT(*) FROM public.members 
        WHERE server_id = p_server_id AND guild_id IS NULL
        ORDER BY guild
      ) t
    ),
    'total_raid_members', (SELECT COUNT(*) FROM public.members WHERE server_id = p_server_id)
  ) INTO result;
RETURN result;
DROP FUNCTION IF EXISTS get_analytics(timestamp with time zone, uuid);
DROP FUNCTION IF EXISTS get_analytics(text, uuid);
DROP FUNCTION IF EXISTS get_analytics(text, uuid, uuid);
DECLARE
  result JSONB;
death_filter TEXT := '';
BEGIN
  -- Build optional guild filter: only deaths with attendees from this guild
  IF guild_id IS NOT NULL THEN
    death_filter := format(
      'AND dr.id IN (SELECT DISTINCT ar.death_record_id FROM attendance_records ar JOIN members m ON m.id = ar.member_id WHERE m.guild_id = %L)',
      guild_id
    );
END IF;
EXECUTE format('
    WITH filtered_deaths AS (
      SELECT dr.id, dr.death_time, dr.boss_id
      FROM death_records dr
      WHERE dr.death_time >= %L::timestamptz
        AND (%L::uuid IS NULL OR dr.server_id = %L::uuid)
        %s
    ),
    stats AS (
      SELECT
        COUNT(*) AS total_kills,
        COALESCE(SUM(ar_count.cnt), 0) AS total_attendance,
        COUNT(DISTINCT ar.member_id) AS active_members
      FROM filtered_deaths fd
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS cnt, array_agg(member_id) AS mids
        FROM attendance_records ar
        WHERE ar.death_record_id = fd.id
      ) ar_count ON true
    ),
    kills_by_week AS (
      SELECT
        to_char(date_trunc(''week'', fd.death_time), ''Mon DD'') AS week_label,
        COUNT(*)::int AS count
      FROM filtered_deaths fd
      GROUP BY date_trunc(''week'', fd.death_time)
      ORDER BY date_trunc(''week'', fd.death_time) DESC
      LIMIT 12
    ),
    top_bosses AS (
      SELECT b.name, COUNT(*)::int AS kills
      FROM filtered_deaths fd
      JOIN bosses b ON b.id = fd.boss_id
      GROUP BY b.name
      ORDER BY kills DESC
      LIMIT 10
    ),
    top_hunters AS (
      SELECT m.name, COUNT(*)::int AS attended
      FROM filtered_deaths fd
      JOIN attendance_records ar ON ar.death_record_id = fd.id
      JOIN members m ON m.id = ar.member_id
      GROUP BY m.name
      ORDER BY attended DESC
      LIMIT 50
    ),
    kills_by_day AS (
      SELECT
        trim(to_char(fd.death_time, ''Day'')) AS day,
        COUNT(*)::int AS count
      FROM filtered_deaths fd
      GROUP BY date_part(''dow'', fd.death_time), to_char(fd.death_time, ''Day'')
      ORDER BY date_part(''dow'', fd.death_time)
    )
    SELECT jsonb_build_object(
      ''total_kills'', COALESCE((SELECT total_kills FROM stats), 0),
      ''total_attendance'', COALESCE((SELECT total_attendance FROM stats), 0),
      ''active_members'', COALESCE((SELECT active_members FROM stats), 0),
      ''kills_by_week'', COALESCE((SELECT jsonb_agg(row_to_json(kills_by_week.*)) FROM kills_by_week), ''[]''::jsonb),
      ''top_bosses'', COALESCE((SELECT jsonb_agg(row_to_json(top_bosses.*)) FROM top_bosses), ''[]''::jsonb),
      ''top_hunters'', COALESCE((SELECT jsonb_agg(row_to_json(top_hunters.*)) FROM top_hunters), ''[]''::jsonb),
      ''kills_by_day'', COALESCE((SELECT jsonb_agg(row_to_json(kills_by_day.*)) FROM kills_by_day), ''[]''::jsonb)
    ) INTO result;
', since, s_id, s_id, death_filter);
RETURN result;
UPDATE public.servers SET game_id = '00000000-0000-0000-0000-000000000001' WHERE game_id IS NULL;
UPDATE public.bosses b
SET template_id = bt.id
FROM public.boss_templates bt
WHERE b.name = bt.name AND bt.game_id = '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.spawn_notifications DROP CONSTRAINT IF EXISTS spawn_notifications_server_id_boss_id_event_spawn_timestamp_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_spawn_notifs_boss ON public.spawn_notifications(server_id, boss_id, event, spawn_timestamp) WHERE boss_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_spawn_notifs_activity ON public.spawn_notifications(server_id, activity_id, event, spawn_timestamp) WHERE activity_id IS NOT NULL;
DECLARE
  v_server_id UUID;
v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
END IF;
RETURN v_server_id;
BEGIN
  RETURN QUERY
  WITH boss_scores AS (
    SELECT
      m.id AS mid,
      m.name AS mname,
      COALESCE(SUM(b.boss_points), 0) AS bp,
      COUNT(DISTINCT dr.id) AS bk
    FROM public.members m
    LEFT JOIN public.attendance_records ar ON ar.member_id = m.id
    LEFT JOIN public.death_records dr ON dr.id = ar.death_record_id
      AND dr.server_id = p_server_id
      AND (p_since IS NULL OR dr.death_time >= p_since)
      AND (p_until IS NULL OR dr.death_time <= p_until)
    LEFT JOIN public.bosses b ON b.id = dr.boss_id
    WHERE m.server_id = p_server_id
    GROUP BY m.id, m.name
  ),
  activity_scores AS (
    SELECT
      m.id AS mid,
      COALESCE(SUM(a.points_per_participant), 0) AS ap,
      COUNT(DISTINCT aa.activity_instance_id) AS aa_count
    FROM public.members m
    LEFT JOIN public.activity_attendance aa ON aa.member_id = m.id AND aa.present = true
    LEFT JOIN public.activity_instances ai ON ai.id = aa.activity_instance_id
      AND (p_since IS NULL OR ai.end_time >= p_since)
      AND (p_until IS NULL OR ai.end_time <= p_until)
    LEFT JOIN public.activities a ON a.id = ai.activity_id AND a.server_id = p_server_id
    WHERE m.server_id = p_server_id
    GROUP BY m.id
  )
  SELECT
    bs.mid,
    bs.mname,
    bs.bp,
    COALESCE(ascores.ap, 0),
    bs.bp + COALESCE(ascores.ap, 0),
    bs.bk,
    COALESCE(ascores.aa_count, 0)
  FROM boss_scores bs
  LEFT JOIN activity_scores ascores ON ascores.mid = bs.mid
  ORDER BY bs.bp + COALESCE(ascores.ap, 0) DESC;
BEGIN
  UPDATE public.bosses
  SET name = NEW.name,
      spawn_type = NEW.spawn_type,
      respawn_hours = NEW.respawn_hours,
      schedule = NEW.schedule,
      is_recurring = NEW.is_recurring,
      category = NEW.category,
      tags = NEW.tags,
      points = NEW.points
  WHERE template_id = NEW.id;
RETURN NEW;
DROP TRIGGER IF EXISTS trg_sync_boss_template ON public.boss_templates;
BEGIN
  UPDATE public.activities
  SET name = NEW.name,
      schedule_type = NEW.schedule_type,
      schedule = NEW.schedule,
      duration_minutes = NEW.duration_minutes,
      points_per_participant = NEW.points_per_participant,
      party_size = NEW.party_size,
      category = NEW.category,
      tags = NEW.tags
  WHERE template_id = NEW.id;
RETURN NEW;
DROP TRIGGER IF EXISTS trg_sync_activity_template ON public.activity_templates;
BEGIN
  -- Delete existing parties for this instance
  DELETE FROM public.activity_parties WHERE activity_instance_id = p_activity_instance_id;
END LOOP;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.servers WHERE id = v_server_id AND viewer_key = v_key::UUID) THEN
    RAISE EXCEPTION 'Invalid viewer key';
END IF;
RETURN QUERY SELECT * FROM public.activities WHERE server_id = v_server_id AND is_enabled = true ORDER BY name;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.servers WHERE id = v_server_id AND viewer_key = v_key::UUID) THEN
    RAISE EXCEPTION 'Invalid viewer key';
END IF;
RETURN QUERY
  SELECT ai.id, ai.activity_id, ai.start_time, ai.end_time, ai.created_at
  FROM public.activity_instances ai
  JOIN public.activities a ON a.id = ai.activity_id
  WHERE a.server_id = v_server_id
  ORDER BY ai.start_time DESC
  LIMIT 200;
DECLARE
  v_server_id UUID;
BEGIN
  SELECT a.server_id INTO v_server_id
  FROM public.activity_instances ai
  JOIN public.activities a ON a.id = ai.activity_id
  WHERE ai.id = v_instance_id;
IF NOT EXISTS (SELECT 1 FROM public.servers WHERE id = v_server_id AND viewer_key = v_key::UUID) THEN
    RAISE EXCEPTION 'Invalid viewer key';
END IF;
RETURN QUERY SELECT * FROM public.activity_parties WHERE activity_instance_id = v_instance_id ORDER BY party_number;
DECLARE
  hh INTEGER;
mm INTEGER;
result TIMESTAMPTZ;
BEGIN
  hh := split_part(p_time_str, ':', 1)::INTEGER;
mm := split_part(p_time_str, ':', 2)::INTEGER;
result := date_trunc('day', p_last_time) + INTERVAL '1 day' + (hh || ' hours')::INTERVAL + (mm || ' minutes')::INTERVAL;
RETURN result;
CREATE INDEX IF NOT EXISTS idx_servers_deleted_at ON public.servers(deleted_at) WHERE deleted_at IS NOT NULL;
DROP POLICY IF EXISTS "Authenticated users can read server names" ON public.servers;
DECLARE
  v_server_id UUID;
v_user_id UUID;
v_guild_id UUID;
BEGIN
  v_user_id := auth.uid();
END IF;
END IF;
RETURN v_server_id;
DROP POLICY IF EXISTS "Server members can read their server" ON public.servers;
DROP POLICY IF EXISTS "Server owners can update their server" ON public.servers;
DROP POLICY IF EXISTS "Server members can read memberships" ON public.server_members;
DROP POLICY IF EXISTS "Server owners can manage memberships" ON public.server_members;
DROP POLICY IF EXISTS "Server members can read guilds" ON public.guilds;
DROP POLICY IF EXISTS "Server moderators can manage guilds" ON public.guilds;
DROP POLICY IF EXISTS "Authenticated users can read bosses" ON public.bosses;
DROP POLICY IF EXISTS "Server members can read bosses" ON public.bosses;
DROP POLICY IF EXISTS "Server moderators can manage bosses" ON public.bosses;
DROP POLICY IF EXISTS "Authenticated users can manage bosses" ON public.bosses;
DROP POLICY IF EXISTS "Authenticated users can read death records" ON public.death_records;
DROP POLICY IF EXISTS "Server members can read death records" ON public.death_records;
DROP POLICY IF EXISTS "Authenticated users can read members" ON public.members;
DROP POLICY IF EXISTS "Server members can read members" ON public.members;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'activities') THEN
    DROP POLICY IF EXISTS "Authenticated users can read activities" ON public.activities;
END IF;
DROP POLICY IF EXISTS "Admins can read roles" ON public.user_roles;
DROP POLICY IF EXISTS "Server members can read boss guilds" ON public.boss_guilds;
DROP POLICY IF EXISTS "Server moderators can manage boss guilds" ON public.boss_guilds;
DROP POLICY IF EXISTS "Server members can read overrides" ON public.boss_spawn_overrides;
DROP POLICY IF EXISTS "Server moderators can manage overrides" ON public.boss_spawn_overrides;
DROP POLICY IF EXISTS "Server members can read adjustments" ON public.point_adjustments;
DROP POLICY IF EXISTS "Server moderators can manage adjustments" ON public.point_adjustments;
SELECT DISTINCT ON (boss_id) boss_id, death_time, owner_guild_id
  FROM public.death_records
  WHERE server_id = p_server_id
  ORDER BY boss_id, death_time DESC;
CREATE INDEX IF NOT EXISTS idx_leaderboard_snapshots_server ON public.leaderboard_snapshots(server_id);
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'guilds', (SELECT COUNT(DISTINCT server_id) FROM public.guilds),
    'kills', (SELECT COUNT(*) FROM public.death_records),
    'players', (SELECT COUNT(*) FROM public.members),
    'servers', (SELECT COUNT(*) FROM public.servers WHERE deleted_at IS NULL)
  ) INTO result;
RETURN result;
DELETE FROM public.bosses WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY name, server_id ORDER BY created_at) as rn
    FROM public.bosses WHERE server_id IS NOT NULL
  ) sub WHERE rn > 1
);
CREATE UNIQUE INDEX IF NOT EXISTS bosses_name_server_unique ON public.bosses(name, server_id);
DROP POLICY IF EXISTS "Server moderators can manage activities" ON public.activities;
DROP POLICY IF EXISTS "Authenticated users can manage activities" ON public.activities;
DROP POLICY IF EXISTS "Authenticated users can manage bosses" ON public.bosses;
DECLARE
  v_count INTEGER;
GET DIAGNOSTICS v_count = ROW_COUNT;
RETURN v_count;
BEGIN
  RETURN 0;
DECLARE
  v_server_id UUID;
v_user_id UUID;
v_count INTEGER;
BEGIN
  v_user_id := auth.uid();
END IF;
GET DIAGNOSTICS v_count = ROW_COUNT;
IF v_count = 0 THEN
      PERFORM public.seed_bosses_for_server(v_server_id);
END IF;
END IF;
RETURN v_server_id;
DECLARE
  v_boss_count INTEGER;
v_act_count INTEGER;
GET DIAGNOSTICS v_boss_count = ROW_COUNT;
GET DIAGNOSTICS v_act_count = ROW_COUNT;
RETURN jsonb_build_object('b', v_boss_count, 'a', v_act_count);
SELECT sm.user_id, u.email::TEXT, sm.role
  FROM public.server_members sm
  LEFT JOIN auth.users u ON u.id = sm.user_id
  WHERE sm.server_id = p_server_id;
SELECT viewer_key FROM public.servers WHERE id = p_server_id;
BEGIN
  -- Verify ownership
  IF NOT EXISTS (SELECT 1 FROM public.server_members WHERE server_id = p_server_id AND user_id = auth.uid() AND role = 'owner') THEN
    RAISE EXCEPTION 'Only the server owner can delete the server';
END IF;
DELETE FROM public.activity_attendance WHERE activity_instance_id IN (SELECT id FROM public.activity_instances WHERE activity_id IN (SELECT id FROM public.activities WHERE server_id = p_server_id));
DELETE FROM public.activity_parties WHERE activity_instance_id IN (SELECT id FROM public.activity_instances WHERE activity_id IN (SELECT id FROM public.activities WHERE server_id = p_server_id));
DELETE FROM public.activity_instances WHERE activity_id IN (SELECT id FROM public.activities WHERE server_id = p_server_id);
DELETE FROM public.activities WHERE server_id = p_server_id;
DELETE FROM public.attendance_records WHERE death_record_id IN (SELECT id FROM public.death_records WHERE server_id = p_server_id);
DELETE FROM public.spawn_notifications WHERE server_id = p_server_id;
DELETE FROM public.death_records WHERE server_id = p_server_id;
DELETE FROM public.boss_spawn_overrides WHERE server_id = p_server_id;
DELETE FROM public.boss_guilds WHERE boss_id IN (SELECT id FROM public.bosses WHERE server_id = p_server_id);
DELETE FROM public.bosses WHERE server_id = p_server_id;
DELETE FROM public.point_adjustments WHERE server_id = p_server_id;
DELETE FROM public.point_rules WHERE server_id = p_server_id;
DELETE FROM public.boss_assists WHERE server_id = p_server_id;
DELETE FROM public.members WHERE server_id = p_server_id;
DELETE FROM public.guilds WHERE server_id = p_server_id;
DELETE FROM public.discord_configs WHERE raidscout_server_id = p_server_id;
DELETE FROM public.server_members WHERE server_id = p_server_id;
DELETE FROM public.servers WHERE id = p_server_id;
DECLARE v_id UUID; v_pts INTEGER;
BEGIN
  v_pts := COALESCE(p_boss_points, 1);
RETURN v_id;
DECLARE v_id UUID;
RETURN v_id;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.server_members WHERE server_id = p_server_id AND user_id = auth.uid() AND role = 'owner') THEN
    RAISE EXCEPTION 'Only the server owner can delete the server';
END IF;
DELETE FROM public.activity_attendance WHERE activity_instance_id IN (SELECT id FROM public.activity_instances WHERE activity_id IN (SELECT id FROM public.activities WHERE server_id = p_server_id));
DELETE FROM public.activity_parties WHERE activity_instance_id IN (SELECT id FROM public.activity_instances WHERE activity_id IN (SELECT id FROM public.activities WHERE server_id = p_server_id));
DELETE FROM public.activity_instances WHERE activity_id IN (SELECT id FROM public.activities WHERE server_id = p_server_id);
DELETE FROM public.activities WHERE server_id = p_server_id;
DELETE FROM public.attendance_records WHERE death_record_id IN (SELECT id FROM public.death_records WHERE server_id = p_server_id);
DELETE FROM public.spawn_notifications WHERE server_id = p_server_id;
DELETE FROM public.death_records WHERE server_id = p_server_id;
DELETE FROM public.boss_spawn_overrides WHERE server_id = p_server_id;
DELETE FROM public.boss_guilds WHERE boss_id IN (SELECT id FROM public.bosses WHERE server_id = p_server_id);
DELETE FROM public.boss_assists WHERE server_id = p_server_id;
DELETE FROM public.point_adjustments WHERE server_id = p_server_id;
DELETE FROM public.point_rules WHERE server_id = p_server_id;
DELETE FROM public.members WHERE server_id = p_server_id;
DELETE FROM public.guilds WHERE server_id = p_server_id;
DELETE FROM public.bosses WHERE server_id = p_server_id;
DELETE FROM public.discord_configs WHERE raidscout_server_id = p_server_id;
DELETE FROM public.server_members WHERE server_id = p_server_id;
DELETE FROM public.servers WHERE id = p_server_id;
DECLARE v_id UUID; v_pts INTEGER;
BEGIN
  v_pts := COALESCE(p_boss_points, 1);
RETURN v_id;
DECLARE v_id UUID;
RETURN v_id;

-- ── Seed Data (reference only, not applied on fresh deploy) ──
-- 31 INSERT statements available in seed.sql
