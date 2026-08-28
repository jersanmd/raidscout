-- Deduplicate boss_assists and add the unique constraint it always needed.
--
-- The boss-points matrix showed one boss with a pile of identical assist chips
-- (measured live: 6 copies of the same owner→assistant pair on Rakajeth). The
-- pile was self-growing: toggleBossAssist read the existing row with
-- .maybeSingle() — which ERRORS when more than one row matches — and discarded
-- the error, so it concluded "no assist yet" and inserted another duplicate on
-- every click, including clicks on the × meant to remove it.
--
-- Same fix boss_guilds got in migration 076 for the same disease, and the
-- protection activity_assists (the twin table) already has: collapse the
-- duplicates, then make recurrence impossible at the schema level. The client
-- toggle is hardened alongside this migration.

DELETE FROM public.boss_assists ba
WHERE ba.id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY boss_id, owner_guild_id, assistant_guild_id
      ORDER BY created_at ASC, id
    ) AS rn
    FROM public.boss_assists
  ) sub
  WHERE sub.rn > 1
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'boss_assists_unique_pair'
  ) THEN
    ALTER TABLE public.boss_assists
      ADD CONSTRAINT boss_assists_unique_pair UNIQUE (boss_id, owner_guild_id, assistant_guild_id);
  END IF;
END;
$$;
