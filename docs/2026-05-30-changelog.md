# May 30, 2026 — Changelog

## Spawn Alert Dedup
- **Frontend**: `sentAlerts` Set in BossListView — one notif per boss per page load
- **Bot**: `sentNotifs` Map in `/notify` handler — 30s TTL per server+event+boss

## Bot Fixes
- **nextspawn alive/dead logic**: Fixed-schedule bosses now check death records and alive window (matching spawnCalculator.ts)
- **Schedule timezone fix**: `scheduleSlotToUTC()` interprets times in server's timezone
- **Separate spawn events**: `boss_spawning` (amber 5-min embed) vs `boss_spawned` (green now embed)
- **Nextspawn countdown**: `formatRelative()` shows "in 3h 15m" instead of Discord's `<t:R>`

## Bot Helpers Added
- `scheduleSlotToUTC(tz, refDate, day, time)` — schedule day/time from server TZ to UTC
- `findNextScheduleSlot(schedule, after, tz)` — timezone-aware next slot finder
- `formatRelative(unix)` — precise countdown string
- `sentNotifs` Map — dedup with 30s TTL

## Removed
- Live underline on kill feature (unreliable)
