# June 10, 2026 — Changelog

## 🆕 New Features

- **`!editkilltime` bot command** — fix kill times with optional date (`HH:MM [YYYY-MM-DD]`), auto-converts server-local time to UTC
- **Responsive carousel** on Leaderboard & Members pages — 2 guild cards on large screens, 1 on mobile, with swipe/drag and dot indicators
- **Spawn toast differentiation** — "spawning now" vs "spawning in ≤ 5 min" show distinct messages; activities use "starting/started/active" wording

## 🎨 UI / Theme

- **Guild cards redesigned** — aligned with app dark theme (`#18181b` surfaces, `#27272a` borders), guild text color as accent only
- **Carousel dots** themed — `#fafafa` active, `#3f3f46` inactive (was amber)
- **Activity cards** use "STARTING/ACTIVE" instead of "SPAWN/SPAWNING", "Set start time" placeholder

## 🐛 Bug Fixes

- **Server Settings → Bosses tab** — collapsed edit forms no longer leave extra space below footer (conditional rendering instead of CSS grid animation)
- **Leaderboard snapshot back button** returns to correct guild filter
- **Spawn cron server count** now includes all `discord_configs` (thread + command channels)
- **Thymele schedule** UTC times corrected
- **Moderator boss editing** permission fixed (was restricted to custom bosses only)
- **`build:bot` output format** fixed — now outputs `.cjs` to match Dockerfile (previous deploys used stale June 9 cache)

## 📋 Activities

- **All upcoming visible**: activities now show in upcoming strip regardless of timeframe (was limited to 24h)
- **Require explicit finish**: fixed_schedule and fixed_hours activities stay active until manually finished, no auto-advancing
- **Viewer mode support**: anon RLS policies for activities, bosses, and activity_instances (`100_viewer_anon_read.sql`)

## 🔧 Bot

- **Help text cleaned**: removed `;list`, `;killed HH:MM today`, `;killed HH:MM yesterday` from `!commands`
- `!editkilltime` added to help, guild-join welcome, and server settings command list

## 📦 Release

- **v0.14.1**
