-- 032_fix_snapshot_period_constraint.sql
-- Allow per-guild snapshot periods like "weekly:GuildName"

ALTER TABLE leaderboard_snapshots 
  DROP CONSTRAINT IF EXISTS leaderboard_snapshots_period_check;

ALTER TABLE leaderboard_snapshots 
  ADD CONSTRAINT leaderboard_snapshots_period_check 
  CHECK (period IN ('all_time', 'weekly', 'monthly') OR period LIKE 'weekly:%');
