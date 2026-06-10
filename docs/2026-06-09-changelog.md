# June 9, 2026 — Changelog

## Leaderboard Fixes

- **Point adjustments in history modal**: member kill history now shows manual point adjustments alongside kills
- **Dedup boss_guilds RPC join**: `get_leaderboard` RPC fixed — `DISTINCT ON (boss_id, guild_id)` prevents double-counting points when multiple rows per (boss, guild) exist

## Loading Screens

- **Wait for guild data** before rendering: 5 pages (BossListView, WeeklyScheduleView, LeaderboardView, MembersView, HistoryView) now gate on guild fetch completion
- **Guild color in UpcomingStrip**: guild name now uses `guildColor()` text color instead of hardcoded `text-[#71717a]`

## Admin Features

- **Admin user role filter** using SECURITY DEFINER RPC (`get_all_admin_roles`)
- **Admin view-as-owner**: admins can join any server as owner for debugging
- **Daily rotation test fixes**: SQL simulation scripts corrected (1-based PostgreSQL array indexing)
- **RPC improvements**: various SECURITY DEFINER function updates

## Landing Page

- Rename "Trackings" to **"Participants"** in stats section
- Filter stats to **active servers only** (exclude archived)
