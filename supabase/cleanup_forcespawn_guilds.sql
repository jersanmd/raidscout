-- Cleanup: Remove forcespawnall overrides for schedule-mode bosses
-- in affected servers. These overrides were created by admin_forcespawn_all
-- and caused incorrect guild ownership before the rotation.ts fix.

-- Delete overrides for bosses with schedule-based guild assignments (day_of_week)
-- in the three affected servers: Y7, Medea 4 - Divine, Yvonne 6
DELETE FROM public.boss_spawn_overrides
WHERE server_id IN (
  SELECT id FROM public.servers WHERE name IN ('Y7', 'Medea 4 - Divine', 'Yvonne 6')
)
AND boss_id IN (
  SELECT DISTINCT bg.boss_id
  FROM public.boss_guilds bg
  WHERE bg.day_of_week IS NOT NULL
);

-- Verify: show remaining overrides in affected servers
SELECT s.name AS server, COUNT(o.id) AS remaining_overrides
FROM public.servers s
LEFT JOIN public.boss_spawn_overrides o ON o.server_id = s.id
WHERE s.name IN ('Y7', 'Medea 4 - Divine', 'Yvonne 6')
GROUP BY s.name;
