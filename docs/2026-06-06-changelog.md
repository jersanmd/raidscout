# June 6, 2026 — Changelog

## Activities & Bosses: UTC Timezone Overhaul

- **AddBossForm**: Fixed Hours bosses now ask for Start Date + Start Time, stored as UTC in `schedule` JSON (`{ time, start_date, utc_start }`)
- **EditBossForm**: Converts UTC back to local timezone for editing
- **spawnCalculator**: `calculateFixedHoursSpawn` uses `utc_start` as initial countdown basis when no death record exists
- **WeeklyScheduleView**: All fixed_schedule bosses now compute spawn dates in UTC (both template and custom)
- **BossCard**: Schedule display uses user's timezone (`tz`) instead of server timezone

## Boss/Activity Soft-Delete (3-State System)

| State | is_enabled | deleted_at | Visible |
|-------|-----------|------------|---------|
| Active | true | NULL | ✅ |
| Disabled | false | NULL | Disabled section |
| Deleted | false | timestamp | ❌ Hidden |

- **Migrations**: `099` (activity soft-delete), `100` (boss soft-delete), `101` (boss toggle/delete RPCs)
- **ServerBossesActivitiesTab**: Active/disabled separation for both bosses and activities
- **Delete confirmation**: Requires typing the boss/activity name to confirm
- **Disabled filtering**: Activity Points and Activity Guild Assignments tabs hide disabled activities

## RLS Fixes for Boss/Activity CRUD

- **Migration 103**: SECURITY DEFINER RPCs for `update_custom_boss`, `update_custom_activity`, `toggle_activity_enabled`, `set_boss_salary`
- All boss/activity CRUD operations now bypass RLS to prevent silent failures
- **EditBossForm**: Fixed `points` → `boss_points` column name mismatch (editing boss points was broken)
- **createCustomActivity**: Removed redundant double-save after RPC

## Leaderboard & Analytics: Activity Integration

- **Leaderboard**: Activity attendance points now included in rankings (RPC first, edge function fallback)
- **Analytics**: `top_hunters` (Most Active Hunters) now counts both boss kills + activity attendance
- **Export**: Activity rows included alongside boss rows with 🎯 marker; rankings include activity points
- **Member history modal**: Merges boss kills + activity attendance in a single sorted list

## Server Settings: Search Everywhere

- **Bosses tab**: Search bar filters active + disabled bosses
- **Activities tab**: Search bar filters active + disabled activities
- **Activity Points tab**: Search bar filters matrix rows
- **Activity Guild Assignments tab**: Search bar filters by activity name

## Members: Combat Power & Class

- **Migration 104**: Added `combat_power` (INTEGER) and `class` (TEXT) to members table
- Server owners can define class lists per server (stored in `app_settings`)
- Add member form: Combat Power input + class dropdown
- Member rows: Inline CP edit + class dropdown (saves via `update_member_stats` RPC)

## Discord Bot & Edge Function: Rate Limit Fix

- **discord-notify**: 3-retry with `Retry-After` respect + 200ms stagger between webhooks
- **discord-bot-gateway.ts**: `discordFetch()` wrapper with same retry logic on all 19 Discord API calls
- **Bot deploy**: Switched to CJS format (`dist/bot.cjs`) with external `ws` to fix Alpine crash
- **Dockerfile**: Simplified single-stage build, ws installed via npm

## Bug Fixes

- **Server delete**: Whitespace-tolerant name comparison (collapses multiple spaces)
- **deleteServer**: Added `.select()` to detect RLS silent failures
- **BossCard**: `onRecordDeath` made optional to support activity cards
- **ActivityGuildsTab**: Fixed duplicate `enabledActivities` declaration
- **ServerBossesActivitiesTab**: Fixed broken JSX structure in search additions

## Files Changed

| File | Change |
|------|--------|
| `src/components/AddBossForm.tsx` | Start date/time fields, UTC conversion |
| `src/components/EditBossForm.tsx` | UTC→local conversion, boss_points fix |
| `src/components/BossCard.tsx` | User TZ display, onRecordDeath optional |
| `src/components/ServerBossesActivitiesTab.tsx` | Search, active/disabled separation, soft-delete |
| `src/components/server/ActivityGuildsTab.tsx` | Search bar, disabled filter |
| `src/components/server/ActivityPointsMatrix.tsx` | Search bar, disabled filter |
| `src/lib/spawnCalculator.ts` | utc_start initial spawn basis |
| `src/lib/api/bosses.ts` | RPC-based CRUD, deleted_at filter |
| `src/lib/api/leaderboard.ts` | fetchMemberActivityHistory, RPC-first leaderboard |
| `src/lib/api/members.ts` | combat_power, class support |
| `src/lib/api/servers.ts` | deleteServer row check |
| `src/lib/api/discord.ts` | (unchanged, localhost guard documented) |
| `src/pages/BossListView.tsx` | Activity import, BossCard onRecordDeath fix |
| `src/pages/LeaderboardView.tsx` | Activity history in modal, export fixes |
| `src/pages/MembersView.tsx` | CP/class inputs, class management |
| `src/pages/WeeklyScheduleView.tsx` | UTC spawn date for all bosses |
| `src/pages/ServerSettingsView.tsx` | Delete name whitespace fix |
| `src/types/index.ts` | Member interface, Boss schedule comment |
| `scripts/discord-bot-gateway.ts` | discordFetch rate-limit wrapper |
| `supabase/functions/discord-notify/index.ts` | 429 retry + stagger |
| `Dockerfile` | CJS build path |
| `fly.toml` | Dockerfile reference |
| `supabase/migrations/097-104` | 8 new migrations |

## Git

- Branch: `master`
- Commits: multiple merges from `master-multi-game-scaling`
