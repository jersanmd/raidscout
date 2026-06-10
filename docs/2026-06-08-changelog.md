# June 8, 2026 — Changelog

## Bot: Thread & Notification Fixes

- **Auto-thread** with owner + assist guilds, 60s tick interval, cleaner logs
- **Thread guilds whitelist** properly checked; [Assist] label for assist guild threads
- **Role mention resolution**: @mentions in notifications now resolve correctly
- **Server TZ in thread dates**: thread titles now use server timezone
- **Prefix on all notifications**: command prefix included in all notif messages, including kill announcements
- **Two-step thread creation API**: prevents race conditions
- **Readable time format**: thread dates display human-readable timestamps
- **Notification dedup** with in-memory cache: prevents duplicate spawn alerts
- **Notify prefix**: custom notification prefix support
- **Hide `forcespawnall`** from bot help/commands list

## Boss Form Fixes

- **EditBossForm**: separate payloads for templates vs server bosses to avoid column mismatches
- **boss_points column**: use `'points'` for templates, `'boss_points'` for server bosses

## Leaderboard

- Remove broken raw points display, fix pagination
