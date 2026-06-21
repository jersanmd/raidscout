# June 21, 2026 — Changelog (v0.15.5)

## 🐛 Bug Fixes

- **Attendance audit UUIDs** — `useRecordDeath` now threads `attendeeNames` from `DeathRecordModal` all the way to `addAttendance`, so attendance audit entries always show member names instead of UUIDs. Previously the "Mark Died" flow passed `undefined` for `memberName`, forcing a DB fallback lookup that could fail.
- **Party leader audit UUIDs** — `ParticipantModal.savePartyLeaders` now resolves member UUIDs to names before writing the `party_leaders_set` audit entry. Previously wrote raw UUIDs like `042496bd-...`.
- **Party leaders silently dropped on kill** — Party leaders selected in `DeathRecordModal` during the "Mark Died" flow were silently dropped by all callers. Now properly threaded: `DeathRecordModal` → `BossCard` → `BossListView`/`WeeklyScheduleView` → `useRecordDeath`. `useRecordDeath` saves `party_leaders` to the death record and writes a proper `party_leaders_set` audit entry with resolved member names.
- **Party leader audit missing from Activity Log** — `party_leaders_set` was defined in `AuditAction` but never added to `AUDIT_ACTION_GROUPS`. Server Activity Log filters by action groups, so these entries were excluded. Added to "Death Records" group.

## 📋 Audit Log

- **Party leaders** — Now audited when set during a kill (via `useRecordDeath`) AND when edited after the fact (via `ParticipantModal`). Both paths resolve member names.
- **Admin audit panel** — Added `party_leaders_set` format case for consistent display.

## 🔧 Internal

- **useRecordDeath.test.ts** — Fixed mock (`setToast` → `toast`) to match actual `ToastContext` API. Updated attendance call assertions for the new 4-argument `addAttendance` signature.
- **DeathRecordModal.onSubmit** — Signature expanded: added `attendeeNames: string[]` parameter. `memberNameMap` built from `useMembers()` and `pendingMembers` to resolve names at submit time.
- **BossCard.onRecordDeath** — Signature expanded: added `attendeeNames` and `partyLeaders` parameters.
- **fetchItems / fetchDistributions** — Added optional `limit` and `cursor` parameters. Distributions now use cursor-based pagination (`lt("distributed_at", cursor)`) instead of fetching all rows.

## 🎨 UI

- **Weekly Schedule loading overlay** — Now covers both week switches AND initial tab open. Uses a `fetchStarted` ref to detect when a fetch actually began before waiting for completion, avoiding the mount race condition where `isFetching` starts as `false`.
- **Leaderboard tab spinner** — Replaced the 8-row skeleton table with a centered `Loader2` spinner, matching all other tabs' loading pattern.
- **Inventory History pagination** — Initial fetch limited to 10 distributions (was unlimited, could load unbounded rows). Added cursor-based "Load More" button that fetches the next 10 and accumulates results.
- **Inventory History search** — When searching, a separate query fetches up to 200 distributions so the search covers all history, not just the 10 loaded rows. Search input shows a spinner while fetching.
