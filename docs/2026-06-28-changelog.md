# June 28, 2026 — Changelog (v0.15.11)

## 🤖 Discord Bot — Performance

- **Spawn cron optimizations** — Five changes to reduce tick duration spikes:
  - **Discord timeout** 20s→10s, retries 3→2 (prevents 60s hung ticks)
  - **Concurrency** 5→8 (~1.6× throughput for 30+ servers)
  - **RPC retry** before REST fallback (avoids 8× query explosion when `bot_server_snapshot` fails)
  - **Batched dedup notifications** — `spawn_notifications` POSTs now batched into 1 per tick instead of ~50 individual requests
  - **Adaptive interval** — Now uses last 10 ticks average with stepped formula `floor(avg/30s)×30s+30s` instead of 60-tick average with fixed 3 thresholds
- **persist-screenshot 401 fixed** — Bot was calling the edge function without `apikey`/`Authorization` headers. Added service role key auth.

## 🐛 Bug Fixes

- **Admin impersonation — stale build / reload loop** — `queueMicrotask(() => navigate("/"))` in the "View Server" button caused a timing gap between `setCurrentServer` and navigation, triggering Vite's "stale build detected" reload and MIME type errors when switching servers. Removed `queueMicrotask` — navigation now happens synchronously with the state update.
- **Member Profile — Notes hidden for viewers/non-staff** — Notes section and delete buttons now only visible to owners and moderators. Regular members and viewers see no notes UI.
- **Member Profile — Back button for viewers/non-staff** — "Back to Members" now navigates to the main Bosses/Activities tab for viewers and non-staff users, preventing broken history navigation from deep-linked profiles.

## 🔐 Viewer RLS Fix — Weekly Attendance & Trend Charts

- **Members page attendance showing 0/0 for viewers** — Root cause: `death_records` RLS policy is `TO authenticated`, blocking viewer (anon) queries. Fixed by:
  - `get_weekly_attendance` RPC — added `SECURITY DEFINER` to bypass RLS
  - `get_guild_weekly_totals` RPC — new SECURITY DEFINER function replacing 3 client-side direct queries (`death_records`, `boss_assists`, `activity_instances`)
  - Frontend `guildWeeklyTotals` now calls RPC instead of direct Supabase queries
- **Member profile trend chart — hunts/acts/loots showing 0 for viewers** — Same RLS issue in `fetchMemberProfile`. Created 3 new SECURITY DEFINER RPCs:
  - `get_member_attendance_history` — replaces `attendance_records` + `death_records` inner join
  - `get_member_activity_attendance` — replaces `activity_attendance` + `activity_instances` inner join
  - `get_member_loot_history` — replaces `distributions` + `items` join
  - Removed hardcoded limits (200/100/50 → 5000) so trend chart shows accurate counts for all time periods
  - Updated `attEventTime` and loot display to handle both nested (old) and flat (RPC) data formats
- **Member Profile — Activity timeline shows 'Event' instead of boss/activity name** — Timeline rendering still used nested object paths (`death_records.bosses.name`) which are null from RPCs. Now checks flat RPC columns first (`boss_name`, `activity_name`, `boss_image_url`, `activity_image_url`) with nested fallback. Also respects `present: false` for activity attendance.
- **Sync-staging improvements** — Added 9 new tables (DKP + misc), clears staging before insert, shows audit log count.

## 🌐 Landing Page — FAQ Overhaul

- **Rewritten all 9 FAQ questions & answers** — Now focused on selling RaidScout's value: why replace spreadsheets, how rotation prevents drama, viewer mode benefits, Discord bot time savings, multi-game support, leaderboard merit system, and attendance tracking.
- **Added 2 new FAQs**: Gear & inventory tracking (CP growth, item catalog, loot history) and DKP / loot auction support (configurable points, real-time auctions, seller/buyer dashboards).
- **Improved readability**: Removed em dashes, increased container width to `max-w-4xl`, larger text (`text-base`), more generous padding and spacing, better contrast on answers.

## 🐛 Test Fixes

- **Bot tests: 218/218 passing** — Fixed `findNextScheduleSlot` using `now` instead of `after` base date, `corsHeaders()` missing `req` argument, `tsconfig.bot.json` missing `types: [node]`, and integrity test referencing deleted `000_initial_schema.sql` → `all_migrations.sql`.
