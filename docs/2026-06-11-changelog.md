# June 11, 2026 — Changelog

## 🆕 New Features

- **Rally image name overlay** — when viewing a rally screenshot fullscreen from history or weekly schedule, a bar of green ✓ badges appears below the image showing every participant already checked in the attendance list
- **Admin Force Spawn All** — Admin Panel → Servers now has a "Force Spawn All" button that spawns all fixed-timer bosses in a server. Requires typing the server name to confirm.

## 🐛 Bug Fixes

- **Analytics attendance limit** — `fetchAnalytics` now paginates the attendance fallback query with a while loop and `.range()` to fetch all records beyond Supabase's default 1000-row limit
- **Viewer analytics all-time** — added anon read policy for `attendance_records` so viewer mode can load all-time leaderboard stats
- **Soft-deleted activities count** — the "Bosses · Activities" banner no longer counts soft-deleted (`is_enabled: false`) activities

## 🎨 UI

- **"Mark Dead" button** — the boss kill button now reads "Mark Dead" instead of "Mark Died" for clearer, more standard terminology
- **Leaderboard tighter spacing** — reduced gaps between period tabs, search, and carousel rankings to match other screens
- **Leaderboard page margins** — responsive padding now matches Boss List standard (`px-3 sm:px-4 py-4 sm:py-6`)
