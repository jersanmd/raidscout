-- 187_death_records_rpc_index: optimize bot_server_snapshot RPC DISTINCT ON query
-- death_records has 18,505 rows and growing. The existing index on (server_id, death_time DESC)
-- doesn't help the DISTINCT ON (boss_id) ORDER BY boss_id, death_time DESC query.
-- This partial index matches both the WHERE clause and ORDER BY, allowing an index-only scan.

CREATE INDEX IF NOT EXISTS death_records_server_boss_deathtime_idx
  ON death_records(server_id, boss_id, death_time DESC)
  WHERE is_initial_spawn IS NOT TRUE;
