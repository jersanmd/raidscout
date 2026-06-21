# June 21, 2026 — Changelog (v0.15.5)

## 🐛 Bug Fixes

- **Attendance audit UUIDs** — `useRecordDeath` now threads `attendeeNames` from `DeathRecordModal` all the way to `addAttendance`, so attendance audit entries always show member names instead of UUIDs. Previously the "Mark Died" flow passed `undefined` for `memberName`, forcing a DB fallback lookup that could fail.
- **Party leader audit UUIDs** — `ParticipantModal.savePartyLeaders` now resolves member UUIDs to names before writing the `party_leaders_set` audit entry. Previously wrote raw UUIDs like `042496bd-...`.
- **Party leaders silently dropped on kill** — Party leaders selected in `DeathRecordModal` during the "Mark Died" flow were silently dropped by all callers. Now properly threaded: `DeathRecordModal` → `BossCard` → `BossListView`/`WeeklyScheduleView` → `useRecordDeath`. `useRecordDeath` saves `party_leaders` to the death record and writes a proper `party_leaders_set` audit entry with resolved member names.
- **Party leader audit missing from Activity Log** — `party_leaders_set` was defined in `AuditAction` but never added to `AUDIT_ACTION_GROUPS`. Server Activity Log filters by action groups, so these entries were excluded. Added to "Death Records" group.
- **Activity attendance audit** — `ParticipantModal` now writes `ATTENDANCE_ADD` / `ATTENDANCE_REMOVE` audit entries when toggling attendance on activity instances (previously wrote nothing). Activity end recording now includes attendee names in the `ACTIVITY_END_RECORD` audit.

## 📋 Audit Log

- **Party leaders** — Now audited when set during a kill (via `useRecordDeath`) AND when edited after the fact (via `ParticipantModal`). Both paths resolve member names.
- **Activity attendance** — Toggling attendance on activity instances now writes `ATTENDANCE_ADD` / `ATTENDANCE_REMOVE` audit entries. Activity end recording (`recordActivityEnd`) now includes attendee names in the `ACTIVITY_END_RECORD` audit.
- **Admin audit panel** — Added `party_leaders_set` format case for consistent display.
- **Audit format** — `activity_end_record` now shows attendee names when available in both Server Activity Log and Admin Panel.

## 🔧 Internal

- **useRecordDeath.test.ts** — Fixed mock (`setToast` → `toast`) to match actual `ToastContext` API. Updated attendance call assertions for the new 4-argument `addAttendance` signature.
- **DeathRecordModal.onSubmit** — Signature expanded: added `attendeeNames: string[]` parameter. `memberNameMap` built from `useMembers()` and `pendingMembers` to resolve names at submit time.
- **BossCard.onRecordDeath** — Signature expanded: added `attendeeNames` and `partyLeaders` parameters.
- **fetchItems / fetchDistributions** — Added optional `limit` and `cursor` parameters. Distributions now use cursor-based pagination (`lt("distributed_at", cursor)`) instead of fetching all rows.
- **fetchAnalytics** — Added `timezone` parameter. `toDateKey()` and `toDayOfWeek()` helpers convert UTC `death_time` to the server's timezone for accurate daily/weekly grouping.
- **recordActivityEnd** — Added `attendeeNames` parameter for audit logging. Threaded through `BossCard`, `BossListView`, `WeeklyScheduleView`.

## 🎨 UI

- **Weekly Schedule loading overlay** — Now covers both week switches AND initial tab open. Uses a `fetchStarted` ref to detect when a fetch actually began before waiting for completion, avoiding the mount race condition where `isFetching` starts as `false`.
- **Leaderboard tab spinner** — Replaced the 8-row skeleton table with a centered `Loader2` spinner, matching all other tabs' loading pattern.
- **Inventory History pagination** — Initial fetch limited to 10 distributions (was unlimited, could load unbounded rows). Added cursor-based "Load More" button that fetches the next 10 and accumulates results.
- **Inventory History search** — When searching, a separate query fetches up to 200 distributions so the search covers all history, not just the 10 loaded rows. Search input shows a spinner while fetching.
- **Bot status indicator** — New dot in the top bar showing RaidScout bot online/offline status (green/yellow/red). Click opens a popup with live-updating uptime counter, Fly.io region with country flag, and interactive trend chart of server scan duration over the past 24 hours. Hover over chart data points to see exact duration, time, and date. Label shows computed scan interval (e.g. "scans every 30s"). Mobile: popup is centered at the top of the screen.
- **Analytics kills per day timezone** — The "Kills per Day" chart now uses the server's timezone for day-of-week grouping instead of UTC. Previously a kill at 2 AM UTC Sunday would mis-categorize as Sunday for an Asia/Manila server when it should be Monday.
- **Analytics trend chart labels** — Increased font sizes on the Kills per Day trend chart (Y-axis: 12px, X-axis: 11px). Tooltip popup enlarged with bigger text and wider max width.
- **Top Combat Power growth** — Now shows growth comparison on every member's bar: `current_cp +growth (percentage%)`. RPC fixed to compare against the member's CP from before the period (e.g., CP from 7 days ago for weekly growth) instead of requiring ≥2 CP updates in the period.
- **History tab** — Initial load now shows 2 days of boss/activity history with infinite scroll auto-fetch. Removed date range filter buttons (Last 7d, Last Month, Custom). Ledger tab retains its own date filters (7d/30d/custom). Search bar moved to the header row.
- **Activity log infinite scroll** — "Load More" button replaced with auto-fetch sentinel. Initial fetch reduced from 100 → 50 entries.
- **Inventory auto-fetch** — History "Load More" button replaced with infinite scroll sentinel. Recipients tab now fetches all distributions (was limited to 10).
- **Audit format** — `activity_end_record` now shows attendee names. Activity attendance toggles now write audit entries.
