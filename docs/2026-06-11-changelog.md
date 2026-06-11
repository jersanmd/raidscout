# June 11, 2026 — Changelog (v0.14.2)

## 🆕 New Features

- **Rally image name overlay** — when viewing a rally screenshot fullscreen from history or weekly schedule, a bar of green ✓ badges appears below the image showing every participant already checked in the attendance list (AI scan results now only shown in DeathRecordModal, not in fullscreen viewer)
- **Admin Force Spawn All** — Admin Panel → Servers now has a "Force Spawn All" button that spawns all fixed-timer bosses in a server. Requires typing the server name to confirm.
- **Search filters activities & custom bosses** — the search bar on Bosses / Activities now matches activities and custom bosses by name, not just seed bosses. The "Activities" filter chip now shows only activities (previously showed bosses mixed in).
- **Leaderboard kill history icons & guild badges** — player kill history now shows boss images (icons) and colored guild badges next to each boss name, with responsive modal widths

## 🐛 Bug Fixes

- **Analytics attendance limit** — `fetchAnalytics` now paginates the attendance fallback query with a while loop and `.range()` to fetch all records beyond Supabase's default 1000-row limit
- **Viewer analytics all-time** — added anon read policy for `attendance_records` so viewer mode can load all-time leaderboard stats
- **Soft-deleted activities count** — the "Bosses · Activities" banner no longer counts soft-deleted (`is_enabled: false`) activities
- **Forcespawn rotation ownership** — schedule and daily mode bosses now use the effective spawn time (including force-spawn overrides) when computing guild ownership in the bot
- **Seed boss timezone** — `getScheduleTz` now hardcodes `"Asia/Manila"` for non-template seed bosses regardless of server timezone, fixing wrong spawn times for servers outside Manila
- **`ReferenceError: p is not defined`** — fixed three `!killed` reply messages that referenced an out-of-scope variable, causing bot crashes
- **Fixed-schedule activity not staying active** — when a fixed_schedule activity's countdown reached zero, it jumped to the next schedule instead of showing "active". Now stays active until manually finished (mirrors boss alive-window logic)

## 🎨 UI

- **"Mark Dead" button** — the boss kill button now reads "Mark Dead" instead of "Mark Died" for clearer, more standard terminology
- **Leaderboard tighter spacing** — reduced gaps between period tabs, search, and carousel rankings to match other screens
- **Leaderboard page margins** — responsive padding now matches Boss List standard (`px-3 sm:px-4 py-4 sm:py-6`)
- **Rally fullscreen viewer** — only shows checked-in attendance names, not AI scan results (scan results now exclusive to death recording flow)

## 🤖 Discord Bot

- **All commands now support activities** — `!killed`, `!forcespawn`, `!editkilltime`, `!nextspawn`, and `!list` all have activity fallbacks. Activities are merged and sorted alongside bosses in `!nextspawn` output.
- **`!killed` activity validation** — `!killed` on an activity now checks if it's running before recording; suggests `!editkilltime` to adjust start time instead of blindly creating a completion record. Fixed_schedule activities now correctly detected as "running" even without an existing instance row.
- **`!nextspawn` activity active window** — fixed_schedule activities now show as **ACTIVE NOW** in `!nextspawn` when within their active window (previously skipped to next schedule slot)
- **Activity notifications** — killing an activity via `!killed` now broadcasts a notification to the `notifhere` channel. Spawn cron also sends 5-minute and spawn-now notifications for activities.
- **Activity spawn auto-threads** — activities now create auto-threads in `threadhere` channels 5 minutes before starting (like bosses do)
- **`!killed` cooldown skipped** — `!forcespawn` no longer triggers the 2-hour cooldown check
- **`!editkilltime` hint** — when a kill is rejected because the boss isn't alive or is on cooldown, the bot now suggests using `!editkilltime` to fix the previous kill instead (now also works for activities, says "start time" instead of "kill time")
- **Timezone handling** — activities now use the correct timezone (UTC for custom/template, Asia/Manila for seed)
- **`!editkilltime` duplicate var fix** — removed duplicate variable declarations in the boss block that could cause runtime crashes

## ⚡ Realtime

- **Activity realtime** — `activity_instances` and `activities` tables now have Supabase realtime enabled. UI updates instantly when activities are killed via Discord bot — no page refresh needed.

## 🧪 Testing

- **Bot unit tests** — 137 tests across 5 files covering spawn utilities, command parsing, list chunking, role mention resolution, party formatting, activity validation, error message formatting, and logging buffer
