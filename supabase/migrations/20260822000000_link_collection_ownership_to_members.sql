-- Collection ownership survives a member rename
--
-- item_collection_manual_ownership identified a player by player_name alone, so
-- renaming a member orphaned every override they had. The ownership matrix then drew
-- two rows for one player: a ghost under the old name holding all the "Owned" labels,
-- and their live row under the new name holding none of them. Clicking a cell on the
-- live row could not clear the ghost either, because the delete was keyed by name.
--
-- Adds member_id and backfills it from two sources: the member whose current name
-- still matches, and — for names that no longer match anyone — distributions, which
-- record both the name used at the time and the member id it belonged to. Rows for
-- players who are no longer members of the server keep a NULL member_id and stay
-- keyed by name, which is what the matrix already shows them as.

-- SET NULL rather than CASCADE: removing a member should not silently delete the
-- overrides recorded for them. The row falls back to its name key and keeps showing
-- in the matrix as a former player, which is how such rows already behave today.
ALTER TABLE public.item_collection_manual_ownership
  ADD COLUMN IF NOT EXISTS member_id UUID REFERENCES public.members(id) ON DELETE SET NULL;

-- ── Backfill: current name first, then the historical name recorded on distributions ──
UPDATE public.item_collection_manual_ownership mo
SET member_id = COALESCE(
  (SELECT m.id FROM public.members m
    WHERE m.server_id = s.server_id
      AND lower(trim(m.name)) = lower(trim(s.player_name))
    LIMIT 1),
  -- Joined to members so a distribution pointing at a deleted member cannot be
  -- backfilled into a value the new foreign key would reject.
  (SELECT d.member_id FROM public.distributions d
    JOIN public.members m2 ON m2.id = d.member_id
    WHERE d.server_id = s.server_id
      AND lower(trim(d.player_name)) = lower(trim(s.player_name))
    GROUP BY d.member_id
    ORDER BY count(*) DESC
    LIMIT 1)
)
FROM (
  SELECT mo2.id, mo2.player_name, c.server_id
  FROM public.item_collection_manual_ownership mo2
  JOIN public.item_collections c ON c.id = mo2.collection_id
  WHERE mo2.member_id IS NULL
) s
WHERE mo.id = s.id;

-- ── Collapse the rows a rename split ──
-- One player can now hold two overrides for the same item, one under each name. The
-- most recent set_at is the one that reflects what was last clicked, so keep that and
-- drop the rest. (id breaks ties so the choice is deterministic.)
DELETE FROM public.item_collection_manual_ownership mo
USING public.item_collection_manual_ownership newer
WHERE mo.member_id IS NOT NULL
  AND newer.member_id = mo.member_id
  AND newer.collection_id = mo.collection_id
  AND newer.item_id = mo.item_id
  AND (newer.set_at, newer.id) > (mo.set_at, mo.id);

-- ── Resync the denormalised name so name-keyed reads agree with member_id ──
-- Skips the row if some other override on the same item already carries that name,
-- which would trip the existing (collection_id, item_id, player_name) unique. Those
-- rows are still correct via member_id; only their cached label stays stale.
UPDATE public.item_collection_manual_ownership mo
SET player_name = m.name
FROM public.members m
WHERE mo.member_id = m.id
  AND mo.player_name IS DISTINCT FROM m.name
  AND NOT EXISTS (
    SELECT 1 FROM public.item_collection_manual_ownership other
    WHERE other.collection_id = mo.collection_id
      AND other.item_id = mo.item_id
      AND other.player_name = m.name
      AND other.id <> mo.id
  );

-- ── Keys ──
-- Deliberately not a partial index: PostgREST upserts name a conflict target by
-- column list, and Postgres can only infer a partial index if the predicate is
-- restated, which supabase-js cannot do. NULLs compare as distinct, so rows for
-- former members do not collide here and keep using the name-keyed unique instead.
CREATE UNIQUE INDEX IF NOT EXISTS item_collection_manual_ownership_member_key
  ON public.item_collection_manual_ownership (collection_id, item_id, member_id);

CREATE INDEX IF NOT EXISTS idx_manual_ownership_member
  ON public.item_collection_manual_ownership (member_id);
