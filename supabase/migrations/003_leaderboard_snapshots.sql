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
