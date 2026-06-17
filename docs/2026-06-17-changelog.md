# June 16–17, 2026 — Changelog (v0.15.0)

## 🆕 New Features

- **Weekly Attendance column** — Members → Progress now shows a "Weekly Attendance" column between Current CP and 30d Growth. Shows percentage of events attended this week (guild-scoped: owned kills + assisted kills + activities). Click the `%`/`⅞` toggle to switch between percentage and fraction (`75%` ↔ `6/8`). Color-coded: green ≥75%, amber ≥50%, red >0%, gray 0%.
- **`!nextspawn` day grouping** — Discord bot now groups spawns by day with 📅 headers (Today, Tomorrow, etc.) using server timezone. Uses Discord native `<t:unix:t>` (12hr) and `<t:unix:R>` (relative) timestamps.
- **Discord auto-thread defaults** — When linking a Discord server in Server Settings → Integrations, all guilds are now auto-assigned to `thread_guilds` by default. No need to manually check each guild.
- **Same Discord server, multiple links** — Migration drops the unique constraint on `discord_configs(discord_guild_id, raidscout_server_id)`, allowing the same Discord server to be linked multiple times with different command prefixes.

## 🐛 Bug Fixes

- **Analytics All Time 400 error** — `fetchAnalytics` now batches the `.in("death_record_id")` filter into chunks of 200 to stay under Supabase's URL length limit. Also batched member ID lookups.
- **Schedule mode guild-per-day not saving** — Fixed three bugs: (1) stale rotation rows leaking into schedule via `bg.day_of_week !== null` filter, (2) optimistic update so dropdowns reflect changes instantly, (3) edge function `get-boss-guilds` filtering out rows with `sort_order: NULL` (PostgreSQL `NULL != -1` = `NULL` = falsy).
- **Role ping with spaces** — `resolvePrefix` regex changed from `/@(\S+)/g` to word-combination matching: tries progressively shorter word groups to match roles with spaces (`@Y2 | MC丶AngBeat` → pings `@Y2` role, displays `| MC丶AngBeat` as text).

## 🎨 UI

- **Wider page containers** — All pages changed from `max-w-7xl` (1280px fixed) to `max-w-[95%] 2xl:max-w-[1600px]`, nearly doubling usable space on large screens.
- **Wider ping input** — Discord integration ping field widened from `w-28`/`w-36` to `w-56` (224px) for multi-role mentions.
- **Schedule schedule "Clear" option removed** — Duplicate `<option value="">` removed from day dropdowns (invalid HTML).

## 🤖 Discord Bot

- **`!nextspawn` timezone fix** — `dayLabel` now uses server timezone instead of bot's UTC clock. Spawns at 1:43 AM UTC correctly grouped under "Tomorrow" for Asia/Manila servers.
- **Role resolution improvement** — `resolvePrefix` progressively shortens word combinations to match roles with display text appended (e.g., `@RoleName | extra text`).

## 🛠️ Admin Panel

- **Vertical sidebar** — Admin Panel now has a vertical sidebar (hidden on mobile) with all 9 admin tabs: Infra, Games, Servers, Users, Owners, Audit, Database, Test Cron, Deleted. Mobile retains a bottom nav bar with the 5 most-used tabs.
- **Footer pinned to bottom** — Admin Panel footer now sticks to the bottom of the viewport, matching the main Layout behavior.
- **Bot Status cards updated** — Memory display corrected from `512 MB` to `1024 MB`. Region now shows the live `FLY_REGION` env var (dynamic) instead of hardcoded `sin`.

## 🔧 Infrastructure

- **Bot retry logic** — Supabase queries now retry up to 3 times with exponential backoff (1s → 2s → 4s) on `fetch failed` errors and 5xx responses. Reduces transient failure impact during network blips.
- **Spawn cron concurrency reduced** — Concurrent server checks lowered from 10 → 5 to reduce peak request pressure on Supabase.
- **Bot moved to Tokyo** — fly.io bot machine relocated from Singapore (`sin`) to Tokyo (`nrt`) to resolve persistent Cloudflare 521/522 origin connectivity issues.

## ⚙️ Discord Integrations

- **More command prefixes** — Added 7 new prefix options: `/`, `//`, `!!`, `!?`, `..`, `|`, `>`. Total of 25 prefixes available.
- **Prefix matching fix** — Bot now sorts prefixes longest-first before matching, so `//` won't be incorrectly matched by `/`, and `!?` won't be caught by `!`.
