# June 20, 2026 — Changelog (v0.15.4)

## 🆕 New Features

- **Activity "Assign Guild" link** — Activity cards with no guild assignment now show a dashed "Assign Guild" button that links directly to Server Settings → Activity Guild Assignments. Mirrors the existing boss card behavior.
- **Pending items filter** — Inventory → History now has a "Pending" filter checkbox to show only undistributed items. Pending items can be deleted with a confirmation dialog.
- **Activity log filters** — Server Settings → Activity Log now has a simple/advanced filter toggle. Simple mode groups actions by category. Advanced mode shows individual action types. Clear filters button animates through groups with a loading spinner.

## 🎨 UI

- **Gray theme across all tabs** — All 10 Server Settings tabs now use `#18181b` (dark gray) instead of `#09090b` (full black).
- **Activity Log button renamed** — Header button now reads "Activity Log" instead of "Activity".
- **Landing page cleanup** — Removed the section dot navigation on the right edge.
- **Admin spawn cron tooltip** — Hovering a data point on the Spawn Cron chart now shows the date and time in the server's timezone.
- **Integrations aliases editor** — Fixed layout so the save button is always visible. Container auto-sizes to content height without clipping.

## 🐛 Bug Fixes

- **Activity point rules applied** — Leaderboard scores now correctly apply time-based point multipliers for guilds (migration 094).
- **Weekly Schedule death window** — All kills within a boss's spawn window now appear, not just the most recent one (migration 095).
- **Viewer toggle dot** — Toggle switches now show a properly visible dark dot when checked.
- **Attendance polling** — Weekly Schedule now polls attendance counts every 3 seconds.
- **Toast visibility** — Color-coded (green/red) with auto-dismiss after 3 seconds.
- **Participant modal sorting** — Members stay in alphabetical order; no more rearranging checked members to the top.
- **Weekly attendance accuracy** — Fixed timestamp mismatches. All pages now use a shared `get_weekly_attendance` RPC (migration 097) for consistent server-scoped counts.
- **Timezone calculation** — Week/month boundaries now correctly use the server's timezone. Fixed `new Date(localStr)` bug.
- **AI scan audit names** — Rally screenshot AI scan now passes member names to audit entries instead of UUIDs.
- **Audit timestamps UTC** — All audit timestamps are now stored as raw UTC ISO strings. UI formats them with the server's timezone on display.

## 📋 Audit Log — Expanded Coverage

- **Members**: Guild change, name edit, bulk add, delete, CP reminder audits. CP updates now include Discord username.
- **Guilds**: Member guild assignment changes audited.
- **Collections**: Create, delete, add/remove item, set/remove ownership — all with collection name.
- **Gear Tracking**: Single audit entry with all stat changes (e.g., `+15 Innis Ring`).
- **Inventory**: Catalog item creation includes category label + image. CP updates include old value + date.
- **Parties**: Assign/unlink include guild name. Boss name on assign.
- **Leaderboard**: Snapshot save includes date range. Guild reset includes guild name.
- **Discord Integrations (new)**: All actions now audited — link, unlink, edit link, channel save, channel clear, thread save, alias save, ping save. Alias save shows per-command before/after changes.
- **Missing filter actions** — `BOSS_ROTATION_ADVANCE`, `BOSS_GUILDS_SET`, and `BOSS_SPAWN_SET` added to filter dropdown.

## 🧩 Weekly Schedule Improvements

- **Unlimited scrollback** — Removed activity filter on `is_enabled`.
- **Instant guild override** — Guild change updates immediately via local ref map.
- **Participant modal** — Owner guild members with checkmarks sorted first.

## 📊 Analytics

- **Most Active Hunters** — Now uses `get_weekly_attendance` RPC for consistent server-scoped boss + activity counts.

## 🔧 Database

- **094_activity_point_rules_multiplier** — Leaderboard RPC applies point rules.
- **095_weekly_schedule_death_window** — `get_deaths_in_window` RPC.
- **096_fix_get_latest_deaths_sig** — Reverted to single-param signature.
- **097_weekly_attendance_rpc** — `get_weekly_attendance` RPC for server-scoped counts via FK joins.
