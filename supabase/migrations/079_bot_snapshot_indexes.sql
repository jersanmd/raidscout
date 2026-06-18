-- 079_bot_snapshot_indexes: optimize bot_server_snapshot RPC performance
-- These indexes ensure the RPC stays fast as data grows, even on Small compute

-- Composite index for death_records ORDER BY death_time DESC in RPC
-- Avoids in-memory sort when filtering by server_id
CREATE INDEX IF NOT EXISTS death_records_server_deathtime_idx
  ON death_records(server_id, death_time DESC);

-- Index for boss_assists IN subquery in RPC
-- Avoids sequential scan of boss_assists table
CREATE INDEX IF NOT EXISTS boss_assists_boss_id_idx
  ON boss_assists(boss_id);
