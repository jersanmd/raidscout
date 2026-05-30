-- 000_core_tables.sql
-- Core infrastructure tables that were previously created in the Supabase dashboard.
-- MUST run before all other migrations.

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

-- ── Boss Guilds Table ───────────────────────────────────────
-- FK to bosses added in 001b (bosses table created in 001)
CREATE TABLE IF NOT EXISTS boss_guilds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boss_id UUID NOT NULL,
  guild_id UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  sort_order INTEGER,
  day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6),
  mode TEXT DEFAULT 'rotation' CHECK (mode IN ('rotation','schedule','daily'))
);

CREATE UNIQUE INDEX IF NOT EXISTS boss_guilds_unique_idx
  ON boss_guilds(boss_id, guild_id, COALESCE(day_of_week, -1));

CREATE INDEX IF NOT EXISTS boss_guilds_boss_idx ON boss_guilds(boss_id);
CREATE INDEX IF NOT EXISTS boss_guilds_guild_idx ON boss_guilds(guild_id);

-- ── Spawn Notifications Table ───────────────────────────────
-- FK to bosses added in 001b
CREATE TABLE IF NOT EXISTS spawn_notifications (
  id BIGSERIAL PRIMARY KEY,
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  boss_id UUID NOT NULL,
  spawn_time TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT now()
);

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

-- ── Point Adjustments Table ─────────────────────────────────
-- FK to members added in 001b (members created in 002)
CREATE TABLE IF NOT EXISTS point_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL,
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  adjusted_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS point_adjustments_server_idx ON point_adjustments(server_id);

-- ── Boss Spawn Overrides Table ──────────────────────────────
-- FK to bosses added in 001b
CREATE TABLE IF NOT EXISTS boss_spawn_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boss_id UUID NOT NULL,
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  death_time TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(boss_id, server_id)
);

CREATE INDEX IF NOT EXISTS boss_spawn_overrides_server_idx ON boss_spawn_overrides(server_id);

-- ── App Settings Table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  server_id UUID REFERENCES servers(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS app_settings_pkey
  ON app_settings(key, COALESCE(server_id, '00000000-0000-0000-0000-000000000000'));

-- ═══════════════════════════════════════════════════════════
-- RLS Policies (all tables exist now, cross-references safe)
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

CREATE POLICY "Admins can read roles" ON user_roles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can manage roles" ON user_roles
  FOR ALL USING (
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

-- ── boss_guilds ─────────────────────────────────────────────
ALTER TABLE boss_guilds ENABLE ROW LEVEL SECURITY;
-- RLS policies moved to 001b_schema_fixes.sql (need bosses table from 001)

-- ── spawn_notifications ─────────────────────────────────────
ALTER TABLE spawn_notifications ENABLE ROW LEVEL SECURITY;
-- RLS policies added in a follow-up; this table is currently write-only by triggers.

-- ── admin_audit_log ─────────────────────────────────────────
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read audit log" ON admin_audit_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Authenticated users can insert audit entries" ON admin_audit_log
  FOR INSERT TO authenticated WITH CHECK (true);

-- ── point_adjustments ──────────────────────────────────────
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

-- ── boss_spawn_overrides ────────────────────────────────────
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

-- ── app_settings ────────────────────────────────────────────
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read app settings" ON app_settings
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage app settings" ON app_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
-- 001_initial_schema.sql
-- LordNine Boss Timer — initial database schema

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ── Bosses Table ────────────────────────────────────────────
create table if not exists bosses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  spawn_type text not null check (spawn_type in ('fixed_hours', 'fixed_schedule')),
  respawn_hours integer,
  schedule jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Death Records Table ─────────────────────────────────────
create table if not exists death_records (
  id uuid primary key default gen_random_uuid(),
  boss_id uuid not null references bosses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  death_time timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Indexes ─────────────────────────────────────────────────
create index if not exists bosses_spawn_type_idx on bosses(spawn_type);
create index if not exists death_records_user_id_idx on death_records(user_id);
create index if not exists death_records_boss_id_idx on death_records(boss_id);
create index if not exists death_records_user_boss_idx on death_records(user_id, boss_id);

-- ── Row Level Security ──────────────────────────────────────

-- Enable RLS on both tables
alter table bosses enable row level security;
alter table death_records enable row level security;

-- Bosses: readable by all authenticated users
create policy "Authenticated users can read bosses"
  on bosses for select
  to authenticated
  using (true);

-- Death records: users can only access their own records
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

-- ── Triggers ────────────────────────────────────────────────

-- Auto-update updated_at on modification
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger bosses_updated_at
  before update on bosses
  for each row execute function update_updated_at();

create trigger death_records_updated_at
  before update on death_records
  for each row execute function update_updated_at();
-- 001b_schema_fixes.sql
-- Columns and foreign keys added in the production dashboard but never tracked in migrations.
-- Run AFTER 001_initial_schema.sql and 002_attendance.sql.

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

-- ── Deferred foreign keys (tables created in 000, referenced tables created in 001-002) ─

-- boss_guilds → bosses
ALTER TABLE boss_guilds
  ADD CONSTRAINT boss_guilds_boss_id_fkey
  FOREIGN KEY (boss_id) REFERENCES bosses(id) ON DELETE CASCADE;

-- spawn_notifications → bosses
ALTER TABLE spawn_notifications
  ADD CONSTRAINT spawn_notifications_boss_id_fkey
  FOREIGN KEY (boss_id) REFERENCES bosses(id) ON DELETE CASCADE;

-- point_adjustments → members
ALTER TABLE point_adjustments
  ADD CONSTRAINT point_adjustments_member_id_fkey
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;

-- boss_spawn_overrides → bosses
ALTER TABLE boss_spawn_overrides
  ADD CONSTRAINT boss_spawn_overrides_boss_id_fkey
  FOREIGN KEY (boss_id) REFERENCES bosses(id) ON DELETE CASCADE;

-- ═══════════════════════════════════════════════════════════
-- RLS Policies deferred from 000 (need bosses table)
-- ═══════════════════════════════════════════════════════════

-- ── boss_guilds RLS (deferred from 000 — now bosses exists) ─
DROP POLICY IF EXISTS "Server members can read boss guilds" ON boss_guilds;
DROP POLICY IF EXISTS "Server moderators can manage boss guilds" ON boss_guilds;

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
-- 002_attendance.sql
-- LordNine Boss Timer — attendance & rally system

-- ── Members Table ───────────────────────────────────────────
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- ── Attendance Records Table ────────────────────────────────
create table if not exists attendance_records (
  id uuid primary key default gen_random_uuid(),
  death_record_id uuid not null references death_records(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(death_record_id, member_id)
);

-- ── Rally Image on Death Records ────────────────────────────
alter table death_records
  add column if not exists rally_image_url text;

-- ── Indexes ─────────────────────────────────────────────────
create index if not exists members_name_idx on members(name);
create index if not exists attendance_death_record_idx on attendance_records(death_record_id);
create index if not exists attendance_member_idx on attendance_records(member_id);

-- ── Row Level Security ──────────────────────────────────────

alter table members enable row level security;
alter table attendance_records enable row level security;

-- Members: readable & writable by all authenticated users
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

-- Attendance: readable & writable by all authenticated users
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

-- Update death_records RLS to allow reading all records (for attendance visibility)
drop policy if exists "Users can read their own death records" on death_records;
create policy "Authenticated users can read death records"
  on death_records for select
  to authenticated
  using (true);

-- Also allow deleting all death records (for Clear All)
drop policy if exists "Users can delete their own death records" on death_records;
create policy "Authenticated users can delete death records"
  on death_records for delete
  to authenticated
  using (true);

-- ── Helper: Get leaderboard (members sorted by points) ──────
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
-- 003_leaderboard_snapshots.sql
-- Store finalized leaderboard rankings as point-in-time snapshots

create table if not exists leaderboard_snapshots (
  id uuid primary key default gen_random_uuid(),
  finalized_at timestamptz not null default now(),
  period_start timestamptz,
  period text not null check (period in ('all_time', 'weekly', 'monthly')),
  rankings jsonb not null,
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists leaderboard_snapshots_period_idx on leaderboard_snapshots(period);
create index if not exists leaderboard_snapshots_finalized_idx on leaderboard_snapshots(finalized_at desc);

-- RLS: readable by all authenticated users
alter table leaderboard_snapshots enable row level security;

create policy "Authenticated users can read snapshots"
  on leaderboard_snapshots for select
  to authenticated
  using (true);

create policy "Authenticated users can insert snapshots"
  on leaderboard_snapshots for insert
  to authenticated
  with check (true);

-- Trigger for updated_at (if needed later)
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;
-- 004_helper_functions.sql
-- Helper functions for the app

-- Resolve a user ID from their email (for moderator invites)
create or replace function get_user_id_by_email(user_email text)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select id from auth.users where email = user_email limit 1;
$$;

-- Grant execute to authenticated users
grant execute on function get_user_id_by_email(text) to authenticated;
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
-- 005_viewer_rpcs.sql
-- Viewer (guest) write operations via RPC with invite_code validation

-- ── Viewer Auth ─────────────────────────────────────────────

create or replace function get_server_by_viewer_key(v_key text)
returns table(id uuid, name text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
    select s.id, s.name
    from servers s
    where s.invite_code = v_key;
end;
$$;

grant execute on function get_server_by_viewer_key(text) to anon, authenticated;

-- ── Death Records ───────────────────────────────────────────

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
declare
  v_server_id uuid;
begin
  -- Validate viewer key
  select id into v_server_id from servers where invite_code = p_viewer_key;
  if v_server_id is null or v_server_id <> p_server_id then
    raise exception 'Invalid viewer key';
  end if;

  return query
    insert into death_records (boss_id, user_id, death_time, server_id, owner_guild_id)
    values (p_boss_id, auth.uid(), p_death_time, p_server_id, p_owner_guild_id)
    returning *;
end;
$$;

grant execute on function viewer_insert_death_record(uuid, timestamptz, uuid, text, uuid) to anon, authenticated;

-- ──

create or replace function viewer_delete_death_record(
  p_death_record_id uuid,
  p_viewer_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_server_id uuid;
begin
  -- Validate viewer key against the death record's server
  select server_id into v_server_id from death_records where id = p_death_record_id;
  if not exists (select 1 from servers where invite_code = p_viewer_key and id = v_server_id) then
    raise exception 'Invalid viewer key';
  end if;

  delete from death_records where id = p_death_record_id;
end;
$$;

grant execute on function viewer_delete_death_record(uuid, text) to anon, authenticated;

-- ── Members ─────────────────────────────────────────────────

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
declare
  v_server_id uuid;
  v_member_id uuid;
begin
  -- Validate viewer key
  select id into v_server_id from servers where invite_code = p_viewer_key;
  if v_server_id is null or v_server_id <> p_server_id then
    raise exception 'Invalid viewer key';
  end if;

  -- Upsert member
  select id into v_member_id from members where name = p_name;
  if v_member_id is null then
    return query insert into members (name) values (p_name) returning *;
  else
    return query select * from members where id = v_member_id;
  end if;
end;
$$;

grant execute on function viewer_upsert_member(text, uuid, text) to anon, authenticated;

-- ── Attendance ──────────────────────────────────────────────

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
declare
  v_server_id uuid;
begin
  -- Validate viewer key against the death record's server
  select server_id into v_server_id from death_records where id = p_death_record_id;
  if not exists (select 1 from servers where invite_code = p_viewer_key and id = v_server_id) then
    raise exception 'Invalid viewer key';
  end if;

  return query
    insert into attendance_records (death_record_id, member_id, server_id)
    values (p_death_record_id, p_member_id, v_server_id)
    on conflict (death_record_id, member_id) do nothing
    returning *;
end;
$$;

grant execute on function viewer_add_attendance(uuid, uuid, text) to anon, authenticated;

-- ──

create or replace function viewer_remove_attendance(
  p_attendance_id uuid,
  p_viewer_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
end;
$$;

grant execute on function viewer_remove_attendance(uuid, text) to anon, authenticated;
-- 006_create_server_with_bosses.sql
-- RPC that creates a new server and seeds all 39 bosses in a transaction.
-- Previously existed only in the database; now tracked here for source control.

CREATE OR REPLACE FUNCTION create_server_with_bosses(server_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  srv_id UUID;
  invite TEXT;
BEGIN
  invite := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));
  
  INSERT INTO public.servers (name, owner_id, invite_code)
  VALUES (server_name, auth.uid(), invite)
  RETURNING id INTO srv_id;

  INSERT INTO public.server_members (server_id, user_id, role)
  VALUES (srv_id, auth.uid(), 'owner');

  -- Seed 39 default bosses (22 fixed_hours + 17 fixed_schedule)
  INSERT INTO public.bosses (server_id, name, spawn_type, respawn_hours, schedule)
  VALUES 
    (srv_id, 'Amentis', 'fixed_hours', 29, NULL),
    (srv_id, 'Araneo', 'fixed_hours', 24, NULL),
    (srv_id, 'Asta', 'fixed_hours', 62, NULL),
    (srv_id, 'Baron', 'fixed_hours', 32, NULL),
    (srv_id, 'Catena', 'fixed_hours', 35, NULL),
    (srv_id, 'Duplican', 'fixed_hours', 48, NULL),
    (srv_id, 'Ego', 'fixed_hours', 21, NULL),
    (srv_id, 'Gareth', 'fixed_hours', 32, NULL),
    (srv_id, 'General Aquleus', 'fixed_hours', 29, NULL),
    (srv_id, 'Lady Dalia', 'fixed_hours', 18, NULL),
    (srv_id, 'Larba', 'fixed_hours', 35, NULL),
    (srv_id, 'Livera', 'fixed_hours', 24, NULL),
    (srv_id, 'Metus', 'fixed_hours', 48, NULL),
    (srv_id, 'Ordo', 'fixed_hours', 62, NULL),
    (srv_id, 'Secreta', 'fixed_hours', 62, NULL),
    (srv_id, 'Shuliar', 'fixed_hours', 35, NULL),
    (srv_id, 'Supore', 'fixed_hours', 62, NULL),
    (srv_id, 'Titore', 'fixed_hours', 37, NULL),
    (srv_id, 'Undomiel', 'fixed_hours', 24, NULL),
    (srv_id, 'Venatus', 'fixed_hours', 10, NULL),
    (srv_id, 'Viorent', 'fixed_hours', 10, NULL),
    (srv_id, 'Wannitas', 'fixed_hours', 48, NULL),
    (srv_id, 'Auraq', 'fixed_schedule', NULL, '[{"day":5,"time":"22:00"},{"day":3,"time":"21:00"}]'::jsonb),
    (srv_id, 'Benji', 'fixed_schedule', NULL, '[{"day":0,"time":"21:00"}]'::jsonb),
    (srv_id, 'Chaiflock', 'fixed_schedule', NULL, '[{"day":0,"time":"15:00"}]'::jsonb),
    (srv_id, 'Clemantis', 'fixed_schedule', NULL, '[{"day":1,"time":"11:30"},{"day":4,"time":"19:00"}]'::jsonb),
    (srv_id, 'Icaruthia', 'fixed_schedule', NULL, '[{"day":2,"time":"21:00"},{"day":5,"time":"21:00"}]'::jsonb),
    (srv_id, 'Libitina', 'fixed_schedule', NULL, '[{"day":1,"time":"21:00"},{"day":6,"time":"21:00"}]'::jsonb),
    (srv_id, 'Lucus', 'fixed_schedule', NULL, '[{"day":6,"time":"22:00"}]'::jsonb),
    (srv_id, 'Milavy', 'fixed_schedule', NULL, '[{"day":6,"time":"15:00"}]'::jsonb),
    (srv_id, 'Motti', 'fixed_schedule', NULL, '[{"day":3,"time":"19:00"},{"day":6,"time":"19:00"}]'::jsonb),
    (srv_id, 'Neutro', 'fixed_schedule', NULL, '[{"day":2,"time":"19:00"},{"day":4,"time":"11:30"}]'::jsonb),
    (srv_id, 'Nevaeh', 'fixed_schedule', NULL, '[{"day":0,"time":"22:00"}]'::jsonb),
    (srv_id, 'Rakajeth', 'fixed_schedule', NULL, '[{"day":2,"time":"22:00"},{"day":0,"time":"19:00"}]'::jsonb),
    (srv_id, 'Ringor', 'fixed_schedule', NULL, '[{"day":6,"time":"17:00"}]'::jsonb),
    (srv_id, 'Roderick', 'fixed_schedule', NULL, '[{"day":5,"time":"19:00"}]'::jsonb),
    (srv_id, 'Saphirus', 'fixed_schedule', NULL, '[{"day":0,"time":"17:00"},{"day":2,"time":"11:30"}]'::jsonb),
    (srv_id, 'Thymele', 'fixed_schedule', NULL, '[{"day":1,"time":"19:00"},{"day":3,"time":"11:30"}]'::jsonb),
    (srv_id, 'Tumier', 'fixed_schedule', NULL, '[{"day":0,"time":"19:00"}]'::jsonb)
  ;

  RETURN jsonb_build_object('id', srv_id, 'name', server_name, 'invite_code', invite);
END;
$$;

GRANT EXECUTE ON FUNCTION create_server_with_bosses(text) TO authenticated;
-- 007_get_all_servers_with_counts.sql
-- RPC that returns all servers with member counts for the admin panel.

DROP FUNCTION IF EXISTS get_all_servers_with_counts();

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
  SELECT 
    s.id,
    s.name,
    s.owner_id,
    s.created_at,
    (SELECT COUNT(*) FROM public.server_members sm WHERE sm.server_id = s.id) AS member_count,
    (SELECT COUNT(*) FROM public.members m WHERE m.server_id = s.id) AS raid_member_count
  FROM public.servers s
  ORDER BY s.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_all_servers_with_counts() TO authenticated;
-- 008_get_server_stats_with_guilds.sql
-- Updates get_server_stats to include guild member breakdown and total raid members.

CREATE OR REPLACE FUNCTION get_server_stats(p_server_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
END;
$$;
-- 009_games_and_templates.sql
-- Multi-game support: games, boss templates, activity templates, and schema extensions.

-- ── Games Table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  icon_url TEXT,
  supported_spawn_types JSONB NOT NULL DEFAULT '["fixed_hours","fixed_schedule","one_time","activity_recurring","activity_one_time"]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read games" ON games
  FOR SELECT USING (true);

CREATE POLICY "Admin can manage games" ON games
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- ── Boss Templates ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS boss_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  spawn_type TEXT NOT NULL CHECK (spawn_type IN ('fixed_hours','fixed_schedule','one_time')),
  respawn_hours INTEGER,
  schedule JSONB,
  is_recurring BOOLEAN NOT NULL DEFAULT true,
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  points INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE boss_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read boss templates" ON boss_templates
  FOR SELECT USING (true);

CREATE POLICY "Admin can manage boss templates" ON boss_templates
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE INDEX IF NOT EXISTS boss_templates_game_idx ON boss_templates(game_id);

-- ── Activity Templates ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  schedule_type TEXT NOT NULL CHECK (schedule_type IN ('recurring','one_time')),
  schedule JSONB,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  points_per_participant INTEGER NOT NULL DEFAULT 1,
  party_size INTEGER,
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  sort_order INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE activity_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read activity templates" ON activity_templates
  FOR SELECT USING (true);

CREATE POLICY "Admin can manage activity templates" ON activity_templates
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE INDEX IF NOT EXISTS activity_templates_game_idx ON activity_templates(game_id);

-- ── Extend servers table ───────────────────────────────────
ALTER TABLE servers
  ADD COLUMN IF NOT EXISTS game_id UUID REFERENCES games(id),
  ADD COLUMN IF NOT EXISTS is_custom_game BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS servers_game_id_idx ON servers(game_id);

-- ── Extend bosses table ────────────────────────────────────
ALTER TABLE bosses
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES boss_templates(id),
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_custom BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS bosses_template_id_idx ON bosses(template_id);
CREATE INDEX IF NOT EXISTS bosses_is_enabled_idx ON bosses(server_id, is_enabled);

-- ── Extend death_records for one-time bosses ───────────────
ALTER TABLE death_records
  ADD COLUMN IF NOT EXISTS is_final BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN death_records.is_final IS 'True when a one-time boss is killed — no further tracking needed';

-- ── Update create_server_with_bosses RPC ───────────────────
-- Now accepts a game_id and seeds from boss_templates + activity_templates.
CREATE OR REPLACE FUNCTION create_server_with_bosses(p_server_name text, p_game_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  srv_id UUID;
  invite TEXT;
BEGIN
  invite := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));
  
  INSERT INTO public.servers (name, owner_id, invite_code, game_id, is_custom_game)
  VALUES (p_server_name, auth.uid(), invite, p_game_id, p_game_id IS NULL)
  RETURNING id INTO srv_id;

  INSERT INTO public.server_members (server_id, user_id, role)
  VALUES (srv_id, auth.uid(), 'owner');

  -- Seed bosses from templates (if a game was selected)
  IF p_game_id IS NOT NULL THEN
    INSERT INTO public.bosses (server_id, template_id, name, spawn_type, respawn_hours, schedule, is_recurring, category, tags, points, is_custom, is_enabled)
    SELECT srv_id, bt.id, bt.name, bt.spawn_type, bt.respawn_hours, bt.schedule, bt.is_recurring, bt.category, bt.tags, bt.points, false, true
    FROM public.boss_templates bt
    WHERE bt.game_id = p_game_id
    ORDER BY bt.sort_order NULLS LAST, bt.name;

    INSERT INTO public.activities (server_id, template_id, name, schedule_type, schedule, duration_minutes, points_per_participant, party_size, is_custom, is_enabled)
    SELECT srv_id, at.id, at.name, at.schedule_type, at.schedule, at.duration_minutes, at.points_per_participant, at.party_size, false, true
    FROM public.activity_templates at
    WHERE at.game_id = p_game_id
    ORDER BY at.sort_order NULLS LAST, at.name;
  END IF;

  RETURN jsonb_build_object('id', srv_id, 'name', p_server_name, 'invite_code', invite, 'game_id', p_game_id);
END;
$$;

GRANT EXECUTE ON FUNCTION create_server_with_bosses(text, uuid) TO authenticated;
-- 010_activities_and_parties.sql
-- Activity tracking, instances, party management, and attendance.

-- ── Activities Table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  template_id UUID REFERENCES activity_templates(id),
  name TEXT NOT NULL,
  schedule_type TEXT NOT NULL CHECK (schedule_type IN ('recurring','one_time')),
  schedule JSONB,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  points_per_participant INTEGER NOT NULL DEFAULT 1,
  party_size INTEGER,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  is_custom BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Server members can read activities" ON activities
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM server_members WHERE server_id = activities.server_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Server moderators can manage activities" ON activities
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM server_members
      WHERE server_id = activities.server_id AND user_id = auth.uid() AND role IN ('owner','moderator')
    )
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM server_members
      WHERE server_id = activities.server_id AND user_id = auth.uid() AND role IN ('owner','moderator')
    )
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE INDEX IF NOT EXISTS activities_server_idx ON activities(server_id);
CREATE INDEX IF NOT EXISTS activities_template_idx ON activities(template_id);

-- ── Activity Instances Table ───────────────────────────────
-- Each instance represents a scheduled occurrence of an activity.
-- For recurring activities, instances are auto-generated from schedule.
-- For one-time activities, a single instance is created.
CREATE TABLE IF NOT EXISTS activity_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE activity_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Server members can read activity instances" ON activity_instances
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM activities a
      JOIN server_members sm ON sm.server_id = a.server_id
      WHERE a.id = activity_instances.activity_id AND sm.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE INDEX IF NOT EXISTS activity_instances_activity_idx ON activity_instances(activity_id);
CREATE INDEX IF NOT EXISTS activity_instances_start_idx ON activity_instances(start_time);

-- ── Activity Parties Table ─────────────────────────────────
-- Server owners/moderators arrange members into parties per activity instance.
CREATE TABLE IF NOT EXISTS activity_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_instance_id UUID NOT NULL REFERENCES activity_instances(id) ON DELETE CASCADE,
  party_number INTEGER NOT NULL,
  member_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(activity_instance_id, party_number)
);

ALTER TABLE activity_parties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Server members can read parties" ON activity_parties
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM activity_instances ai
      JOIN activities a ON a.id = ai.activity_id
      JOIN server_members sm ON sm.server_id = a.server_id
      WHERE ai.id = activity_parties.activity_instance_id AND sm.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Server moderators can manage parties" ON activity_parties
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM activity_instances ai
      JOIN activities a ON a.id = ai.activity_id
      JOIN server_members sm ON sm.server_id = a.server_id
      WHERE ai.id = activity_parties.activity_instance_id AND sm.user_id = auth.uid() AND sm.role IN ('owner','moderator')
    )
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM activity_instances ai
      JOIN activities a ON a.id = ai.activity_id
      JOIN server_members sm ON sm.server_id = a.server_id
      WHERE ai.id = activity_parties.activity_instance_id AND sm.user_id = auth.uid() AND sm.role IN ('owner','moderator')
    )
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE INDEX IF NOT EXISTS activity_parties_instance_idx ON activity_parties(activity_instance_id);

-- ── Activity Attendance Table ──────────────────────────────
-- Default assumption: all server members attend.
-- Moderators mark absentees per activity instance.
CREATE TABLE IF NOT EXISTS activity_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_instance_id UUID NOT NULL REFERENCES activity_instances(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  present BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(activity_instance_id, member_id)
);

ALTER TABLE activity_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Server members can read attendance" ON activity_attendance
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM activity_instances ai
      JOIN activities a ON a.id = ai.activity_id
      JOIN server_members sm ON sm.server_id = a.server_id
      WHERE ai.id = activity_attendance.activity_instance_id AND sm.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Server moderators can manage attendance" ON activity_attendance
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM activity_instances ai
      JOIN activities a ON a.id = ai.activity_id
      JOIN server_members sm ON sm.server_id = a.server_id
      WHERE ai.id = activity_attendance.activity_instance_id AND sm.user_id = auth.uid() AND sm.role IN ('owner','moderator')
    )
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM activity_instances ai
      JOIN activities a ON a.id = ai.activity_id
      JOIN server_members sm ON sm.server_id = a.server_id
      WHERE ai.id = activity_attendance.activity_instance_id AND sm.user_id = auth.uid() AND sm.role IN ('owner','moderator')
    )
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE INDEX IF NOT EXISTS activity_attendance_instance_idx ON activity_attendance(activity_instance_id);
CREATE INDEX IF NOT EXISTS activity_attendance_member_idx ON activity_attendance(member_id);
-- 011_boss_parties.sql
-- Party management for bosses — server owners arrange members into parties per boss.

CREATE TABLE IF NOT EXISTS boss_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boss_id UUID NOT NULL REFERENCES bosses(id) ON DELETE CASCADE,
  party_number INTEGER NOT NULL,
  member_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(boss_id, party_number)
);

ALTER TABLE boss_parties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Server members can read boss parties" ON boss_parties
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM bosses b
      JOIN server_members sm ON sm.server_id = b.server_id
      WHERE b.id = boss_parties.boss_id AND sm.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Server moderators can manage boss parties" ON boss_parties
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM bosses b
      JOIN server_members sm ON sm.server_id = b.server_id
      WHERE b.id = boss_parties.boss_id AND sm.user_id = auth.uid() AND sm.role IN ('owner','moderator')
    )
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM bosses b
      JOIN server_members sm ON sm.server_id = b.server_id
      WHERE b.id = boss_parties.boss_id AND sm.user_id = auth.uid() AND sm.role IN ('owner','moderator')
    )
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE INDEX IF NOT EXISTS boss_parties_boss_idx ON boss_parties(boss_id);
-- 012_static_parties.sql
-- Default party lineups per server. Auto-fills when assigning parties to bosses or activities.
-- Owner sets once, then every new boss/activity party pre-fills from these defaults.

CREATE TABLE IF NOT EXISTS static_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  party_number INTEGER NOT NULL,
  label TEXT,
  member_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(server_id, party_number)
);

ALTER TABLE static_parties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Server members can read static parties" ON static_parties
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM server_members WHERE server_id = static_parties.server_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Server moderators can manage static parties" ON static_parties
  FOR ALL USING (
    EXISTS (SELECT 1 FROM server_members WHERE server_id = static_parties.server_id AND user_id = auth.uid() AND role IN ('owner','moderator'))
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM server_members WHERE server_id = static_parties.server_id AND user_id = auth.uid() AND role IN ('owner','moderator'))
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE INDEX IF NOT EXISTS static_parties_server_idx ON static_parties(server_id);
// backend/db/migrations/001_auth_tables.sql
// Auth-related tables for the Railway migration.
// Run on Railway Postgres.

-- Users table (replaces Supabase auth.users)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sessions table (JWT refresh tokens)
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_token_idx ON sessions(token);

-- Verification tokens (email verification)
CREATE TABLE IF NOT EXISTS verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Update server_members to reference users instead of auth.users
-- (auth.users won't exist on Railway Postgres)
ALTER TABLE server_members DROP CONSTRAINT IF EXISTS server_members_user_id_fkey;
ALTER TABLE server_members ADD CONSTRAINT server_members_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;
ALTER TABLE user_roles ADD CONSTRAINT user_roles_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE death_records DROP CONSTRAINT IF EXISTS death_records_user_id_fkey;

ALTER TABLE admin_audit_log DROP CONSTRAINT IF EXISTS admin_audit_log_actor_id_fkey;
ALTER TABLE admin_audit_log ADD CONSTRAINT admin_audit_log_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES users(id);

ALTER TABLE point_adjustments DROP CONSTRAINT IF EXISTS point_adjustments_adjusted_by_fkey;
ALTER TABLE point_adjustments ADD CONSTRAINT point_adjustments_adjusted_by_fkey
  FOREIGN KEY (adjusted_by) REFERENCES users(id);
-- seed_multi_game.sql
-- Seeds the LordNine game with all 48 boss templates and 0 activity templates.
-- Run AFTER migrations 001-010 have been applied.

-- ── LordNine Game ──────────────────────────────────────────
INSERT INTO games (name, slug, supported_spawn_types) VALUES
  ('LordNine', 'lordnine', '["fixed_hours","fixed_schedule","one_time"]'::jsonb);

-- ── Boss Templates ─────────────────────────────────────────
WITH lordnine AS (SELECT id FROM games WHERE slug = 'lordnine')
INSERT INTO boss_templates (game_id, name, spawn_type, respawn_hours, schedule, is_recurring, category, points, sort_order)
SELECT lordnine.id, name, spawn_type, respawn_hours, schedule, is_recurring, category, points, sort_order
FROM lordnine,
(VALUES
  -- Fixed Hours (22 bosses)
  ('Venatus',         'fixed_hours', 10, NULL, true, 'World Boss', 50, 1),
  ('Viorent',         'fixed_hours', 10, NULL, true, 'World Boss', 50, 2),
  ('Ego',             'fixed_hours', 21, NULL, true, 'World Boss', 30, 3),
  ('Livera',          'fixed_hours', 24, NULL, true, 'World Boss', 30, 4),
  ('Araneo',          'fixed_hours', 24, NULL, true, 'World Boss', 20, 5),
  ('Undomiel',        'fixed_hours', 24, NULL, true, 'World Boss', 20, 6),
  ('Lady Dalia',      'fixed_hours', 18, NULL, true, 'World Boss', 20, 7),
  ('General Aquleus', 'fixed_hours', 29, NULL, true, 'Field Boss', 15, 8),
  ('Amentis',         'fixed_hours', 29, NULL, true, 'Field Boss', 15, 9),
  ('Baron',           'fixed_hours', 32, NULL, true, 'Field Boss', 15, 10),
  ('Wannitas',        'fixed_hours', 48, NULL, true, 'Field Boss', 10, 11),
  ('Metus',           'fixed_hours', 48, NULL, true, 'Field Boss', 10, 12),
  ('Duplican',        'fixed_hours', 48, NULL, true, 'Field Boss', 10, 13),
  ('Shuliar',         'fixed_hours', 35, NULL, true, 'Field Boss', 10, 14),
  ('Gareth',          'fixed_hours', 32, NULL, true, 'Field Boss', 10, 15),
  ('Titore',          'fixed_hours', 37, NULL, true, 'Field Boss', 10, 16),
  ('Larba',           'fixed_hours', 35, NULL, true, 'Field Boss', 10, 17),
  ('Catena',          'fixed_hours', 35, NULL, true, 'Field Boss', 10, 18),
  ('Secreta',         'fixed_hours', 62, NULL, true, 'Dungeon Boss', 5, 19),
  ('Ordo',            'fixed_hours', 62, NULL, true, 'Dungeon Boss', 5, 20),
  ('Asta',            'fixed_hours', 62, NULL, true, 'Dungeon Boss', 5, 21),
  ('Supore',          'fixed_hours', 62, NULL, true, 'Dungeon Boss', 5, 22),

  -- Fixed Schedule — Single Slot (8 bosses)
  ('Milavy',         'fixed_schedule', NULL, '[{"day":6,"time":"15:00"}]'::jsonb, true, 'World Boss', 30, 23),
  ('Ringor',         'fixed_schedule', NULL, '[{"day":6,"time":"17:00"}]'::jsonb, true, 'World Boss', 30, 24),
  ('Roderick',       'fixed_schedule', NULL, '[{"day":5,"time":"19:00"}]'::jsonb, true, 'World Boss', 30, 25),
  ('Chaiflock',      'fixed_schedule', NULL, '[{"day":0,"time":"15:00"}]'::jsonb, true, 'World Boss', 20, 26),
  ('Benji',          'fixed_schedule', NULL, '[{"day":0,"time":"21:00"}]'::jsonb, true, 'World Boss', 30, 27),
  ('Nevaeh',         'fixed_schedule', NULL, '[{"day":0,"time":"22:00"}]'::jsonb, true, 'World Boss', 30, 28),
  ('Tumier',         'fixed_schedule', NULL, '[{"day":0,"time":"19:00"}]'::jsonb, true, 'World Boss', 20, 29),
  ('Lucus',          'fixed_schedule', NULL, '[{"day":6,"time":"22:00"}]'::jsonb, true, 'World Boss', 30, 30),

  -- Fixed Schedule — Split Multi-Slot (18 bosses)
  ('Clemantis · Mon', 'fixed_schedule', NULL, '[{"day":1,"time":"11:30"}]'::jsonb, true, 'World Boss', 20, 31),
  ('Clemantis · Thu', 'fixed_schedule', NULL, '[{"day":4,"time":"19:00"}]'::jsonb, true, 'World Boss', 20, 32),
  ('Saphirus · Sun',  'fixed_schedule', NULL, '[{"day":0,"time":"17:00"}]'::jsonb, true, 'World Boss', 20, 33),
  ('Saphirus · Tue',  'fixed_schedule', NULL, '[{"day":2,"time":"11:30"}]'::jsonb, true, 'World Boss', 20, 34),
  ('Neutro · Tue',    'fixed_schedule', NULL, '[{"day":2,"time":"19:00"}]'::jsonb, true, 'World Boss', 20, 35),
  ('Neutro · Thu',    'fixed_schedule', NULL, '[{"day":4,"time":"11:30"}]'::jsonb, true, 'World Boss', 20, 36),
  ('Thymele · Mon',   'fixed_schedule', NULL, '[{"day":1,"time":"19:00"}]'::jsonb, true, 'World Boss', 20, 37),
  ('Thymele · Wed',   'fixed_schedule', NULL, '[{"day":3,"time":"11:30"}]'::jsonb, true, 'World Boss', 20, 38),
  ('Auraq · Wed',     'fixed_schedule', NULL, '[{"day":3,"time":"21:00"}]'::jsonb, true, 'World Boss', 20, 39),
  ('Auraq · Fri',     'fixed_schedule', NULL, '[{"day":5,"time":"22:00"}]'::jsonb, true, 'World Boss', 20, 40),
  ('Libitina · Mon',  'fixed_schedule', NULL, '[{"day":1,"time":"21:00"}]'::jsonb, true, 'World Boss', 30, 41),
  ('Libitina · Sat',  'fixed_schedule', NULL, '[{"day":6,"time":"21:00"}]'::jsonb, true, 'World Boss', 30, 42),
  ('Rakajeth · Sun',  'fixed_schedule', NULL, '[{"day":0,"time":"19:00"}]'::jsonb, true, 'World Boss', 20, 43),
  ('Rakajeth · Tue',  'fixed_schedule', NULL, '[{"day":2,"time":"22:00"}]'::jsonb, true, 'World Boss', 20, 44),
  ('Icaruthia · Tue', 'fixed_schedule', NULL, '[{"day":2,"time":"21:00"}]'::jsonb, true, 'World Boss', 30, 45),
  ('Icaruthia · Fri', 'fixed_schedule', NULL, '[{"day":5,"time":"21:00"}]'::jsonb, true, 'World Boss', 30, 46),
  ('Motti · Wed',     'fixed_schedule', NULL, '[{"day":3,"time":"19:00"}]'::jsonb, true, 'World Boss', 20, 47),
  ('Motti · Sat',     'fixed_schedule', NULL, '[{"day":6,"time":"19:00"}]'::jsonb, true, 'World Boss', 20, 48)
) AS t(name, spawn_type, respawn_hours, schedule, is_recurring, category, points, sort_order);
