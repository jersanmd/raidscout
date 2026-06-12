-- Migration 076: Fix boss_guilds duplicate rows + deduplicate in RPC

-- 1. Remove duplicate boss_guilds (keep the one with lowest sort_order or earliest created_at)
DELETE FROM boss_guilds bg
WHERE bg.id IN (
  SELECT bg.id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY boss_id, guild_id ORDER BY sort_order NULLS LAST, created_at ASC) AS rn
    FROM boss_guilds
  ) sub
  WHERE sub.rn > 1
);

-- 2. Add unique constraint to prevent future duplicates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'boss_guilds_boss_guild_unique'
  ) THEN
    ALTER TABLE boss_guilds ADD CONSTRAINT boss_guilds_boss_guild_unique UNIQUE (boss_id, guild_id);
  END IF;
END;
$$;
