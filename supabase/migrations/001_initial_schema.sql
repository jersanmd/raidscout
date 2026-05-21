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
