# June 3, 2026 — Changelog (v0.13.25)

## Leaderboard Recovery
- Per-guild carousel rendering recovered
- Each guild column: Shield icon, guild name, member count, action buttons
- Per-guild buttons: History, Points, Export, Finalize, Reset
- History modal filtered by guild
- Point History modal filtered by guild
- Kill history modal shows total vs leaderboard point comparison
- Export panel above carousel with smooth slide animation
- Carousel position saved to localStorage per server
- Larger buttons, tighter spacing

## Per-Guild Reset Logic
- Reset now passes null to RPC (per-guild resets)
- Both tabs use `fetchLeaderboardByPeriod(null)` triggering guild reset logic

## Leaderboard Snapshots
- Per-guild reset keys: `leaderboard_reset_at:GuildName`
- Recovered key param on getLeaderboardResetAt/setLeaderboardResetAt

## Recovered Code
- `ConfirmDialog.tsx`: confirmText prop
- `fetchMemberKills`: per-guild point overrides + time multipliers + serverTimezone
- `resetGuildPoints`: exists and works

## Database Migrations
- 038: Per-guild leaderboard RPC with boss_guilds.points COALESCE
- 039: Time-based multiplier support (server timezone-aware)
- Backfilled per-guild reset keys

## Orphaned Files Removed
- ServerBossesActivitiesTab.tsx
- UpcomingActivitiesStrip.tsx
- activityCalculator.ts
- AddBossForm.tsx
- AddActivityForm.tsx
