# June 4, 2026 — Changelog

## Supabase Migration: Old → New Project

- Migrated from `oeugehqgpodzhagomeex` (old) to `cjuacehmienztxrhwnlg` (new)
- Recreated all edge functions on new project:
  - `get-boss-guilds` — deduplicates by MAX(points), bypasses anon RLS
  - `get-leaderboard` — v3 with pagination, deduplication, per-guild resets, time multipliers
  - `get-member-kills` — point calculation matching history modal
  - `get-snapshots` — dual-purpose (list by server or single by ID)
  - `get-attendance` — attendance by death_record_ids
  - `ai-vision` — AI screenshot analysis
  - `discord-notify` — "Powered by RaidScout" footer on all embeds

## Post-Migration Bug Fixes

### PostgREST Issues
- **Schema cache**: PostgREST doesn't pick up `CREATE OR REPLACE FUNCTION` changes; `NOTIFY pgrst` doesn't work; new function names return 404
- **Column swapping**: `bosses` table — PostgREST REST API swaps `boss_points` ↔ `points`. Fixed by requesting `boss_points` in edge functions to get the correct `points` value
- **Anon filtering**: Edge functions bypass PostgREST anon filtering bug on `boss_guilds`, `attendance_records`, `leaderboard_snapshots`

### RLS Policies
- Fixed `boss_guilds` RLS (migration 083)
- Added anon policy for `boss_guilds` (migration 084)
- Leaderboard-related fixes (migrations 087-092)

### Leaderboard Fixes
- **Double counting**: Fixed by deduplicating attendance (`GROUP BY member_id, death_record_id`) and boss_guilds (`unique_bg` CTE with `MAX(points)`)
- **PANORTH 0 points**: Edge function attendance query limited to 1000 rows; fixed by querying by `server_id` with pagination
- **Point calculation**: Now matches history modal exactly

### Viewer Mode
- All features now work in viewer mode: guilds, analytics, leaderboard, snapshots, history
- "Post 24h Spawns to Discord" button hidden for viewers
- Edge functions handle viewer authentication

## User Timezone Support

- Created `useUserTimezone` hook with custom event (`raidscout-tz-change`) + storage listener for instant cross-component reactivity
- LeaderboardView: kill history modal dates use user timezone
- WeeklyScheduleView: all 4 `toLocaleDateString`/`toLocaleTimeString` calls use user timezone

## Bot Fixes

### Guild Ownership Bug (Roderick → PANORTH)
- **Phase 1**: `computeOwnerGuild` — filtered `sort_order !== -1` (ghost rows from PostgREST stale cache)
- **Phase 2**: Added `sort_order > 0` filter to rotation mode (matching website logic)
- **Phase 3**: Rebuilt `dist/bot.js` before deploy (Docker cached old JS)
- Deployed to Fly.io (`raidscout-bot`, Singapore region)

### Other Bot Fixes
- `scripts/discord-bot-gateway.ts` line 139: `bgs.filter(bg => bg.sort_order !== -1)`
- HistoryView: Added `fetchGuilds` import, `Guild` type, `guilds` state, passes `ownerGuildId` to ParticipantModal

## Edge Functions Created

| Function | Purpose |
|----------|---------|
| `get-boss-guilds` | Fetch boss_guilds with dedup, bypasses anon RLS |
| `get-leaderboard` | v3 — paginated, deduplicated, per-guild points |
| `get-member-kills` | Kill history with proper point calculation |
| `get-snapshots` | List snapshots or fetch single by ID |
| `get-attendance` | Attendance by death_record_ids |
| `ai-vision` | AI screenshot analysis |
| `discord-notify` | Discord embed notifications |

## Database Migrations

| Migration | Description |
|-----------|-------------|
| 082 | Custom RPCs for new project |
| 083 | `boss_guilds` RLS fix |
| 084 | Anon policy for `boss_guilds` |
| 087-092 | Leaderboard fixes (dedup, pagination, points) |

## Key Files Changed

| File | Change |
|------|--------|
| `src/lib/supabase.ts` | Edge functions for boss_guilds, leaderboard, member kills, snapshots |
| `src/pages/LeaderboardView.tsx` | User timezone in kill history |
| `src/pages/WeeklyScheduleView.tsx` | User timezone in all date displays |
| `src/pages/HistoryView.tsx` | Guild context for ParticipantModal |
| `src/hooks/useUserTimezone.ts` | Cross-component timezone reactivity |
| `scripts/discord-bot-gateway.ts` | sort_order filters, guild computation fixes |
| `supabase/functions/*` | All edge functions recreated |
| `supabase/migrations/082-092` | RLS, leaderboard, performance fixes |

## Known Issues (at end of June 4)

- `OPENAI_API_KEY` secret still needs setting on new project
- PostgREST schema cache requires project restart for some changes
