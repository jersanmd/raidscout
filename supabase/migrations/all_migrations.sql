-- Run this in SQL Editor: https://supabase.com/dashboard/project/jbkhpxvvsphycodzhmxb/sql

-- ===== 000_core_tables.sql =====

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


-- ===== 001_initial_schema.sql =====

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


-- ===== 002_attendance.sql =====

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


-- ===== 002b_schema_fixes.sql =====

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


-- ===== 003_leaderboard_snapshots.sql =====

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


-- ===== 004_helper_functions.sql =====

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


-- ===== 005_viewer_rpcs.sql =====

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


-- ===== 005_spawn_notifications.sql =====

-- 014_spawn_notifications: Dedup table for cron-based spawn alerts
-- Ensures boss_spawning (5-min warning) and boss_spawned (spawn now)
-- fire exactly once per spawn cycle, even across bot restarts.

CREATE TABLE IF NOT EXISTS public.spawn_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  boss_id UUID NOT NULL REFERENCES public.bosses(id) ON DELETE CASCADE,
  event TEXT NOT NULL CHECK (event IN ('boss_spawning', 'boss_spawned')),
  spawn_timestamp BIGINT NOT NULL, -- Unix seconds of the calculated next spawn time
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (server_id, boss_id, event, spawn_timestamp)
);

CREATE INDEX IF NOT EXISTS idx_spawn_notifs_created_at ON public.spawn_notifications(created_at);

-- Enable RLS but allow service_role full access (bot uses service_role key)
ALTER TABLE public.spawn_notifications ENABLE ROW LEVEL SECURITY;


-- ===== 006_multi_server_prefix.sql =====

-- ── Multi-Server Prefix Support ───────────────────────────
-- Allows multiple RaidScout servers to link to one Discord guild,
-- each with its own command prefix (e.g. ";" vs "!" vs "$").

-- 1. Drop the single-server-per-guild constraint
ALTER TABLE discord_configs DROP CONSTRAINT IF EXISTS discord_configs_discord_guild_id_key;

-- 2. Add command_prefix column (default "!" for new rows)
ALTER TABLE discord_configs ADD COLUMN IF NOT EXISTS command_prefix TEXT NOT NULL DEFAULT '!';

-- 3. Each prefix can only be used once per Discord guild
ALTER TABLE discord_configs DROP CONSTRAINT IF EXISTS discord_configs_discord_guild_id_command_prefix_key;
ALTER TABLE discord_configs ADD CONSTRAINT discord_configs_discord_guild_id_command_prefix_key 
  UNIQUE (discord_guild_id, command_prefix);

-- 4. Add notification_channel_id if not already present
ALTER TABLE discord_configs ADD COLUMN IF NOT EXISTS notification_channel_id TEXT;

-- 5. Update existing rows (which had ";" hardcoded) to use ";" prefix
--    so they don't break. New servers will default to "!".
UPDATE discord_configs SET command_prefix = ';' WHERE command_prefix = '!';


-- ===== 006_discord_configs.sql =====

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
DROP POLICY IF EXISTS "Users can manage discord_configs" ON discord_configs;
CREATE POLICY "Users can manage discord_configs" ON discord_configs
  FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);


-- ===== 007_get_all_servers_with_counts.sql =====

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


-- ===== 007_create_server_with_bosses.sql =====

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


-- ===== 007b_helper_functions.sql =====

-- 007b_helper_functions.sql
-- Helper functions used by analytics and server stats (depends on user_roles from 000).

-- Check if the current user is a platform admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;


-- ===== 008_get_server_stats_with_guilds.sql =====

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


-- ===== 008_guild_analytics.sql =====

-- ── Guild-filtered Analytics ──────────────────────────────
-- Drops old overloads first, then creates a single version
-- with optional guild_id parameter.

DROP FUNCTION IF EXISTS get_analytics(timestamp with time zone, uuid);
DROP FUNCTION IF EXISTS get_analytics(text, uuid);
DROP FUNCTION IF EXISTS get_analytics(text, uuid, uuid);

CREATE OR REPLACE FUNCTION get_analytics(
  since TEXT,
  s_id UUID DEFAULT NULL,
  guild_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
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
END;
$$;


-- ===== 009_games_and_templates.sql =====

-- 009_games_and_templates: Foundation for multi-game support
-- Creates games table, boss_templates, and activity_templates.
-- Seeds LordNine game + 39 boss templates.

CREATE TABLE IF NOT EXISTS public.games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  icon_url TEXT,
  supported_spawn_types JSONB NOT NULL DEFAULT '["fixed_hours","fixed_schedule"]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

-- RLS: read by all authenticated, write by admins
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boss_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_templates ENABLE ROW LEVEL SECURITY;

-- Seed: LordNine game
INSERT INTO public.games (id, name, slug, supported_spawn_types)
VALUES ('00000000-0000-0000-0000-000000000001', 'LordNine: Infinite Class', 'lordnine', '["fixed_hours","fixed_schedule"]'::jsonb);

-- Seed: 39 boss templates for LordNine
INSERT INTO public.boss_templates (game_id, name, spawn_type, respawn_hours, schedule, is_recurring, points) VALUES
('00000000-0000-0000-0000-000000000001', 'Venatus', 'fixed_hours', 10, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Viorent', 'fixed_hours', 12, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Ego', 'fixed_hours', 21, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Clemantis', 'fixed_hours', 12, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Livera', 'fixed_hours', 8, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Araneo', 'fixed_hours', 14, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Undomiel', 'fixed_hours', 16, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Saphirus', 'fixed_hours', 18, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Neutro', 'fixed_hours', 20, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Lady Dalia', 'fixed_hours', 24, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'General Aquleus', 'fixed_hours', 24, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Thymele', 'fixed_hours', 12, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Amentis', 'fixed_hours', 10, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Baron', 'fixed_hours', 12, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Milavy', 'fixed_hours', 24, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Wannitas', 'fixed_hours', 48, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Metus', 'fixed_hours', 24, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Duplican', 'fixed_hours', 32, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Shuliar', 'fixed_hours', 36, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Ringor', 'fixed_hours', 48, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Roderick', 'fixed_hours', 62, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Gareth', 'fixed_hours', 24, NULL, true, 1),
('00000000-0000-0000-0000-000000000001', 'Auraq', 'fixed_schedule', NULL, '[{"day":5,"time":"22:00"},{"day":3,"time":"21:00"}]'::jsonb, true, 1),
('00000000-0000-0000-0000-000000000001', 'Benji', 'fixed_schedule', NULL, '[{"day":0,"time":"21:00"}]'::jsonb, true, 1),
('00000000-0000-0000-0000-000000000001', 'Chaiflock', 'fixed_schedule', NULL, '[{"day":0,"time":"15:00"}]'::jsonb, true, 1),
('00000000-0000-0000-0000-000000000001', 'Clemantis', 'fixed_schedule', NULL, '[{"day":1,"time":"11:30"},{"day":4,"time":"19:00"}]'::jsonb, true, 1),
('00000000-0000-0000-0000-000000000001', 'Icaruthia', 'fixed_schedule', NULL, '[{"day":2,"time":"21:00"},{"day":5,"time":"21:00"}]'::jsonb, true, 1),
('00000000-0000-0000-0000-000000000001', 'Libitina', 'fixed_schedule', NULL, '[{"day":1,"time":"21:00"},{"day":6,"time":"21:00"}]'::jsonb, true, 1),
('00000000-0000-0000-0000-000000000001', 'Lucus', 'fixed_schedule', NULL, '[{"day":6,"time":"22:00"}]'::jsonb, true, 1),
('00000000-0000-0000-0000-000000000001', 'Motti', 'fixed_schedule', NULL, '[{"day":2,"time":"22:00"}]'::jsonb, true, 1),
('00000000-0000-0000-0000-000000000001', 'Nevaeh', 'fixed_schedule', NULL, '[{"day":3,"time":"22:00"}]'::jsonb, true, 1),
('00000000-0000-0000-0000-000000000001', 'Ordo', 'fixed_schedule', NULL, '[{"day":4,"time":"22:00"},{"day":5,"time":"17:00"}]'::jsonb, true, 1),
('00000000-0000-0000-0000-000000000001', 'Rakajeth', 'fixed_schedule', NULL, '[{"day":6,"time":"20:00"},{"day":1,"time":"15:00"}]'::jsonb, true, 1),
('00000000-0000-0000-0000-000000000001', 'Secreta', 'fixed_schedule', NULL, '[{"day":2,"time":"20:00"},{"day":4,"time":"18:00"}]'::jsonb, true, 1),
('00000000-0000-0000-0000-000000000001', 'Supore', 'fixed_schedule', NULL, '[{"day":0,"time":"19:00"},{"day":3,"time":"14:00"}]'::jsonb, true, 1),
('00000000-0000-0000-0000-000000000001', 'Titore', 'fixed_schedule', NULL, '[{"day":0,"time":"18:00"}]'::jsonb, true, 1),
('00000000-0000-0000-0000-000000000001', 'Larba', 'fixed_schedule', NULL, '[{"day":2,"time":"18:00"}]'::jsonb, true, 1),
('00000000-0000-0000-0000-000000000001', 'Catena', 'fixed_schedule', NULL, '[{"day":3,"time":"15:00"},{"day":6,"time":"19:00"}]'::jsonb, true, 1),
('00000000-0000-0000-0000-000000000001', 'Tumier', 'fixed_schedule', NULL, '[{"day":5,"time":"15:00"}]'::jsonb, true, 1);


-- ===== 009_command_aliases.sql =====

-- ── Custom Command Aliases ────────────────────────────────
ALTER TABLE discord_configs ADD COLUMN IF NOT EXISTS command_aliases JSONB DEFAULT '{}'::jsonb;


-- ===== 010_activities_and_parties.sql =====

-- 010_activities_and_parties: Activities, instances, parties, attendance
-- Depends on 009 (games, templates).

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

CREATE TABLE IF NOT EXISTS public.activity_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.activity_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_instance_id UUID NOT NULL REFERENCES public.activity_instances(id) ON DELETE CASCADE,
  party_number INTEGER NOT NULL,
  member_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (activity_instance_id, party_number)
);

CREATE TABLE IF NOT EXISTS public.activity_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_instance_id UUID NOT NULL REFERENCES public.activity_instances(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  present BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (activity_instance_id, member_id)
);

-- RLS
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_attendance ENABLE ROW LEVEL SECURITY;


-- ===== 011_server_game_association.sql =====

-- 011_server_game_association: Link servers to games, extend bosses/death_records
-- Depends on 009 (games + templates) and 010 (activities).

-- Add game_id to servers
ALTER TABLE public.servers ADD COLUMN IF NOT EXISTS game_id UUID REFERENCES public.games(id) ON DELETE SET NULL;
-- Backfill existing servers with LordNine game
UPDATE public.servers SET game_id = '00000000-0000-0000-0000-000000000001' WHERE game_id IS NULL;

-- Extend bosses
ALTER TABLE public.bosses ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.boss_templates(id) ON DELETE SET NULL;
ALTER TABLE public.bosses ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.bosses ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.bosses ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.bosses ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE public.bosses ADD COLUMN IF NOT EXISTS is_custom BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.bosses ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 1;

-- Backfill existing bosses with template_id (match by name)
UPDATE public.bosses b
SET template_id = bt.id
FROM public.boss_templates bt
WHERE b.name = bt.name AND bt.game_id = '00000000-0000-0000-0000-000000000001';

-- Extend death_records for one-time bosses
ALTER TABLE public.death_records ADD COLUMN IF NOT EXISTS is_final BOOLEAN NOT NULL DEFAULT false;

-- Extend spawn_notifications for activity dedup
ALTER TABLE public.spawn_notifications ADD COLUMN IF NOT EXISTS activity_id UUID REFERENCES public.activities(id) ON DELETE CASCADE;
ALTER TABLE public.spawn_notifications ADD CONSTRAINT spawn_notifs_one_target CHECK (
  (boss_id IS NOT NULL AND activity_id IS NULL) OR (boss_id IS NULL AND activity_id IS NOT NULL)
);

-- Replace the UNIQUE constraint with partial indexes (handles nullable boss_id/activity_id)
ALTER TABLE public.spawn_notifications DROP CONSTRAINT IF EXISTS spawn_notifications_server_id_boss_id_event_spawn_timestamp_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_spawn_notifs_boss ON public.spawn_notifications(server_id, boss_id, event, spawn_timestamp) WHERE boss_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_spawn_notifs_activity ON public.spawn_notifications(server_id, activity_id, event, spawn_timestamp) WHERE activity_id IS NOT NULL;


-- ===== 012_update_create_server_rpc.sql =====

-- 012_update_create_server_rpc: Rewrite create_server_with_bosses for multi-game
-- Accepts game_id + seed flag. No longer hardcodes LordNine bosses.

CREATE OR REPLACE FUNCTION public.create_server_with_bosses(
  p_name TEXT,
  p_game_id UUID,
  p_seed BOOLEAN DEFAULT true
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_server_id UUID;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  -- Create the server
  INSERT INTO public.servers (name, owner_id, game_id)
  VALUES (p_name, v_user_id, p_game_id)
  RETURNING id INTO v_server_id;

  -- Set the creator as owner in server_members
  INSERT INTO public.server_members (server_id, user_id, role)
  VALUES (v_server_id, v_user_id, 'owner');

  -- Seed bosses from templates if requested
  IF p_seed THEN
    INSERT INTO public.bosses (server_id, template_id, name, spawn_type, respawn_hours, schedule)
    SELECT v_server_id, bt.id, bt.name, bt.spawn_type, bt.respawn_hours, bt.schedule
    FROM public.boss_templates bt
    WHERE bt.game_id = p_game_id;

    -- Seed activities from templates if requested
    INSERT INTO public.activities (server_id, template_id, name, schedule_type, schedule, duration_minutes, points_per_participant, party_size)
    SELECT v_server_id, at.id, at.name, at.schedule_type, at.schedule, at.duration_minutes, at.points_per_participant, at.party_size
    FROM public.activity_templates at
    WHERE at.game_id = p_game_id;
  END IF;

  RETURN v_server_id;
END;
$$;


-- ===== 013_leaderboard_activity_points.sql =====

-- 013_leaderboard_activity_points: Extend get_leaderboard to include activity points
-- Players earn points from both boss kills and activity attendance.

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
END;
$$;


-- ===== 014_auto_sync_templates.sql =====

-- 014_auto_sync: Trigger-based auto-sync when templates are updated
-- When an admin updates a boss_template or activity_template, 
-- all linked server bosses/activities get updated automatically.

CREATE OR REPLACE FUNCTION public.sync_boss_template()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_boss_template ON public.boss_templates;
CREATE TRIGGER trg_sync_boss_template
  AFTER UPDATE ON public.boss_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_boss_template();

CREATE OR REPLACE FUNCTION public.sync_activity_template()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_activity_template ON public.activity_templates;
CREATE TRIGGER trg_sync_activity_template
  AFTER UPDATE ON public.activity_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_activity_template();


-- ===== 015_activity_parties_rpc.sql =====

-- 015_activity_parties_rpc: Functions for managing activity parties

CREATE OR REPLACE FUNCTION public.set_activity_parties(
  p_activity_instance_id UUID,
  p_parties JSONB -- [{party_number: 1, member_ids: [uuid, ...]}, ...]
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete existing parties for this instance
  DELETE FROM public.activity_parties WHERE activity_instance_id = p_activity_instance_id;
  
  -- Insert new parties
  FOR i IN 0..jsonb_array_length(p_parties) - 1 LOOP
    INSERT INTO public.activity_parties (activity_instance_id, party_number, member_ids)
    VALUES (
      p_activity_instance_id,
      (p_parties->i->>'party_number')::INTEGER,
      (SELECT array_agg(v::UUID) FROM jsonb_array_elements_text(p_parties->i->'member_ids') v)
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_activity_attendance(
  p_activity_instance_id UUID,
  p_member_id UUID,
  p_present BOOLEAN DEFAULT true
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.activity_attendance (activity_instance_id, member_id, present)
  VALUES (p_activity_instance_id, p_member_id, p_present)
  ON CONFLICT (activity_instance_id, member_id)
  DO UPDATE SET present = EXCLUDED.present;
END;
$$;


-- ===== 016_viewer_activity_rpcs.sql =====

-- 016_viewer_activity_rpcs: Viewer RPCs for activity tables
-- SECURITY DEFINER functions with viewer key validation.

CREATE OR REPLACE FUNCTION public.viewer_get_activities(
  v_server_id UUID,
  v_key TEXT
) RETURNS SETOF public.activities
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.servers WHERE id = v_server_id AND viewer_key = v_key::UUID) THEN
    RAISE EXCEPTION 'Invalid viewer key';
  END IF;
  RETURN QUERY SELECT * FROM public.activities WHERE server_id = v_server_id AND is_enabled = true ORDER BY name;
END;
$$;

CREATE OR REPLACE FUNCTION public.viewer_get_activity_instances(
  v_server_id UUID,
  v_key TEXT
) RETURNS TABLE(
  id UUID, activity_id UUID, start_time TIMESTAMPTZ, end_time TIMESTAMPTZ, created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
END;
$$;

CREATE OR REPLACE FUNCTION public.viewer_get_activity_parties(
  v_instance_id UUID,
  v_key TEXT
) RETURNS SETOF public.activity_parties
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
END;
$$;


-- ===== 017_find_daily_slot.sql =====

-- 017_find_daily_slot: Helper function for daily-recurring activities

CREATE OR REPLACE FUNCTION public.find_next_daily_slot(
  p_last_time TIMESTAMPTZ,
  p_time_str TEXT -- "HH:MM"
) RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  hh INTEGER;
  mm INTEGER;
  result TIMESTAMPTZ;
BEGIN
  hh := split_part(p_time_str, ':', 1)::INTEGER;
  mm := split_part(p_time_str, ':', 2)::INTEGER;
  
  -- Next day at the specified time
  result := date_trunc('day', p_last_time) + INTERVAL '1 day' + (hh || ' hours')::INTERVAL + (mm || ' minutes')::INTERVAL;
  
  RETURN result;
END;
$$;

ALTER TABLE discord_configs ADD COLUMN IF NOT EXISTS command_channel_id TEXT;


-- ===== 019_soft_delete_servers.sql =====

-- 015_soft_delete_servers: Soft-delete servers instead of hard-deleting
-- Preserves all data — owner can't see deleted server, admins can restore.

ALTER TABLE public.servers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_servers_deleted_at ON public.servers(deleted_at) WHERE deleted_at IS NOT NULL;

