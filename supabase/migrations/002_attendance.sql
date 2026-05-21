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
