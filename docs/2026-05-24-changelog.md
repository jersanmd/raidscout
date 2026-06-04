# May 24, 2026 — Changelog (v1.12.2)

## Spawn Overrides System (NEW)
- `boss_spawn_overrides` table: separate storage for spawn time adjustments
- `setBossSpawnTime` inserts overrides instead of mutating death records
- Kill auto-clears override (DB + cache)
- `bulk_mark_bosses_alive` RPC: marks all unknown via overrides
- `fetchSpawnOverrides` + `overrideMap` in `useBossSpawns`
- Realtime subscription invalidates spawn_overrides
- 5 new unit tests + 9 integration tests (62 total)

## Admin Panel
- Guild member breakdown with colored badges
- "Raid Members" and "Members" stat tiles
- Server rows show raid member count badge
- Mobile-responsive tabs

## Leaderboard Fixes
- Removed auto-finalize every Monday
- Week-0: first finalize uses `server.created_at`
- Reset date from `leaderboard_snapshots.finalized_at` (DB), not localStorage
- Viewer snapshots + period tabs now accessible
- `viewer_add_attendance` now stores `server_id`
- Backfilled 22 attendance records with NULL server_id

## Analytics
- Numbers inside bars for kills/week, activity/day, most killed bosses
- Left-aligned labels, bigger fonts

## Server Creation
- `create_server_with_bosses` RPC creates guild + boss_guilds in one transaction (fixes 403 RLS)

## Boss Schedules
- Chaiflock: Saturday 3pm → Sunday 3pm
- Nevaeh: Saturday 10pm → Sunday 10pm

## DB Migrations
- `boss_spawn_overrides` table + policies
- `bulk_mark_bosses_alive`, `make_bosses_alive` RPCs updated
- `get_latest_deaths` updated (14-day window)
- `get_user_servers` includes created_at
- `app_settings` unique constraint on (key, server_id)
