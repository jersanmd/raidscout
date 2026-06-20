# June 20, 2026 — Changelog (v0.15.3)

## 🆕 New Features

- **Activity "Assign Guild" link** — Activity cards with no guild assignment now show a dashed "Assign Guild" button that links directly to Server Settings → Activity Guild Assignments. Mirrors the existing boss card behavior.
- **Pending items filter** — Inventory → History now has a "Pending" filter checkbox to show only undistributed items. Pending items can be deleted with a confirmation dialog.
- **Activity log filters** — Server Settings → Activity Log now has a simple/advanced filter toggle. Simple mode groups actions by category (Bosses, Members, Items, etc.). Advanced mode shows individual action types. Clear filters button now animates through groups with a loading spinner.

## 🎨 UI

- **Gray theme across all tabs** — All 10 Server Settings tabs now use `#18181b` (dark gray) instead of `#09090b` (full black) for section containers: General, Guilds, Boss Guild Assignments, Activity Guild Assignments, Boss Points, Activity Points, Members/Permissions, Integrations, Account, Danger.
- **Activity Log button renamed** — Header button now reads "Activity Log" instead of "Activity".
- **Landing page cleanup** — Removed the section dot navigation on the right edge.
- **Admin spawn cron tooltip** — Hovering a data point on the Spawn Cron chart now shows the date and time.

## 🐛 Bug Fixes

- **Activity point rules applied** — Leaderboard scores now correctly apply time-based point multipliers for guilds (migration 094).
- **Weekly Schedule death window** — All kills within a boss's spawn window now appear on the Weekly Schedule, not just the most recent one (migration 095).
- **Viewer toggle dot** — Toggle switches now show a properly visible dark dot when checked.
- **Attendance polling** — Weekly Schedule now polls attendance counts every 3 seconds for real-time updates.
- **Toast visibility** — Success/error toasts are now color-coded (green border for success, red for error) and auto-dismiss after 3 seconds.
- **Participant modal sorting** — Members now stay in alphabetical order when toggling attendance; no more rearranging checked members to the top.
- **Weekly attendance accuracy** — Fixed timestamp mismatches between numerator (`created_at`) and denominator (`death_time`/`end_time`). All pages now use a shared `get_weekly_attendance` RPC (migration 097) for consistent server-scoped counts.
- **Timezone calculation** — Week/month boundaries now correctly use the server's timezone regardless of where the frontend runs. Fixed `new Date(localStr)` bug that used system timezone instead of server timezone.

## 📋 Audit Log — Expanded Coverage

- **Members**: Guild change, name edit, bulk add, delete, CP reminder now all write audit entries.
- **Guilds**: Member guild assignment changes now audited.
- **Collections**: Create, delete, add item, remove item, set ownership, remove ownership all audited.
- **Gear Tracking**: Single audit entry with all stat changes (e.g., `+15 Innis Ring`). Uses item name from editing state.
- **Inventory**: Catalog item creation includes category label and image presence. Item distribution passes the item name. CP updates include old CP value and date.
- **Parties**: Party assign/unlink now include guild name. Boss name included on assign.
- **Leaderboard**: Snapshot save includes date range. Guild point reset includes guild name.
- **Discord**: CP reminder messages now write audit entries.
- **Missing filter actions** — `BOSS_ROTATION_ADVANCE`, `BOSS_GUILDS_SET`, and `BOSS_SPAWN_SET` added to filter dropdown.

## 🧩 Weekly Schedule Improvements

- **Unlimited scrollback** — Removed activity filter on `is_enabled`, allowing view of all historical entries.
- **Instant guild override** — Changing a guild on a killed boss updates immediately using a local ref map.
- **Participant modal** — Owner guild members with checkmarks now sorted first.

## 📊 Analytics

- **Most Active Hunters** — Now uses `get_weekly_attendance` RPC for consistent server-scoped boss + activity attendance counts.

## 🔧 Database

- **094_activity_point_rules_multiplier** — `get_leaderboard` RPC now applies point rules to activity scores.
- **095_weekly_schedule_death_window** — New `get_deaths_in_window` RPC returns all kills within a time window.
- **096_fix_get_latest_deaths_sig** — Reverted `get_latest_deaths` to single-parameter signature for PostgREST compatibility.
- **097_weekly_attendance_rpc** — New `get_weekly_attendance` RPC returns server-scoped member attendance counts via FK joins, used by Members, Profile, and Analytics pages.
