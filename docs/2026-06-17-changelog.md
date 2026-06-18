# June 16–17, 2026 — Changelog (v0.15.0)

## 🆕 New Features

- **Weekly Attendance column** — Members → Progress now shows a "Weekly Attendance" column between Current CP and 30d Growth. Shows percentage of events attended this week (guild-scoped: owned kills + assisted kills + activities). Click the `%`/`⅞` toggle to switch between percentage and fraction (`75%` ↔ `6/8`). Color-coded: green ≥75%, amber ≥50%, red >0%, gray 0%.
- **`!nextspawn` day grouping** — Discord bot now groups spawns by day with 📅 headers (Today, Tomorrow, etc.) using server timezone. Uses Discord native `<t:unix:t>` (12hr) and `<t:unix:R>` (relative) timestamps.
- **Discord auto-thread defaults** — When linking a Discord server in Server Settings → Integrations, all guilds are now auto-assigned to thread channels by default. No need to manually check each guild.
- **Same Discord server, multiple prefixes** — The same Discord server can now be linked multiple times with different command prefixes.

## 🐛 Bug Fixes

- **Analytics All Time error** — Fixed 400 error on large servers by batching analytics lookups.
- **Schedule mode guild-per-day not saving** — Fixed guild assignments not saving for schedule-mode bosses with per-day guild rotation.
- **Role ping with spaces** — Discord role mentions with spaces (like `@Y2 | MC丶AngBeat`) now correctly ping the role while displaying the extra text.

## 🎨 UI

- **Wider page containers** — All pages expanded from 1280px to nearly double the width on large screens, making better use of widescreen monitors.
- **Wider ping input** — Discord integration ping field widened for multi-role mentions.
- **Schedule "Clear" option removed** — Duplicate empty option removed from day dropdowns.

## 🤖 Discord Bot

- **`!nextspawn` timezone fix** — Day labels now use your server's timezone instead of UTC. Spawns at odd hours correctly grouped under the right day.
- **Role resolution improvement** — Bot now progressively matches role names with spaces, allowing display text after the role mention.

## 🔗 URL-Synced Tabs

- **History** — Timeline/Ledger tabs now sync to the URL. Persists on refresh and share.
- **Leaderboard** — Since Reset / All Time selection persists in the URL.
- **Inventory** — All 5 tabs (Catalog, Collections, History, Recipients, Analytics) persist in the URL.
- **Analytics** — Period selection (This Week / This Month / All Time) persists in the URL.

## 🎨 UI — Continued

- **Moderator permissions** — Server Settings now shows a clickable "⚙ Permissions" badge for moderators with clear descriptions of what each toggle controls.

## 📦 Inventory Upgrades

- **Collection delete confirmation** — Requires typing the collection name to confirm before deleting.
- **All members in matrix** — Collection Ownership matrix now includes all server members, even those with zero distributed items.
- **Recipients name sort** — Click the "Name" column header to toggle between most-items and alphabetical (A→Z).
- **Matrix guild badges** — Player names in ownership matrix now show colored guild badges with Shield icons.
- **Matrix row numbers** — Each player row shows a counter on the left.
- **Matrix player search** — Search bar (far right) filters the matrix by player name.
- **Matrix hover sync** — Sticky player name column now highlights in sync with the rest of the row.
- **Inventory loading screen** — Spinner appears until data is fully loaded.

- **Sticky matrix headers** — Item headers and player column stay fixed when scrolling.
- **Matrix item sorting** — Click any item header to sort players by ownership (owners first ▼ → missing first ▲ → clear). Active sort highlights the header with a direction arrow.
- **Matrix distribute button** — Each player row has a "+" button (appears on hover) that opens a modal to search items and instantly distribute. Table auto-refreshes after distribution.
- **Recipients: all members** — Members with zero items received now appear in the recipients list. Toolbar rearranged: filters (Guild, Sort) on the left, search on the far right.
- **Sidebar: all server icons** — Collapsed sidebar now shows all server icons (not just current). When hover-expanding, icon positions match the full sidebar.

## 🐛 Class Icons Fix

- **Consistent class icons** — Inventory now uses the same class icons as the Members page.
- **Case-insensitive matching** — Class names now match regardless of capitalization.
- **Member ID matching** — Kill history now correctly attributes to the right member.
- **All members loaded** — No more 1000-member limit; inactive members included.

##  Infrastructure

- **Bot retry logic** — Bot now retries failed requests up to 3 times with increasing delays, reducing impact of temporary network issues.
- **Spawn cron optimized** — Reduced concurrent server checks to lower peak load.
- **Bot moved to Tokyo** — Relocated for better connectivity and reliability.

## ⚙️ Discord Integrations

- **More command prefixes** — Added 7 new prefix options: `/`, `//`, `!!`, `!?`, `..`, `|`, `>`. Total of 25 prefixes available.
- **Prefix matching fix** — Bot now sorts prefixes longest-first before matching, so `//` won't be incorrectly matched by `/`, and `!?` won't be caught by `!`.
