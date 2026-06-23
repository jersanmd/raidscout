# June 23, 2026 — Changelog (v0.15.8)

## 🐛 Bug Fixes

- **History page — day-based pagination replaces broken cursor approach** — The cursor-based infinite scroll had three cascading bugs: (1) `since` filter capped every page at 2 days; (2) activity entries broke the cursor (`deathTime` undefined); (3) a single merged cursor caused day-skipping when an old activity was the page's last entry. Replaced entirely with day-based fetching: initial load grabs today + yesterday, each `loadMore` fetches the complete day before the oldest loaded day using `since`/`until` scoping. No cursors, no gaps, no complexity.
- **History page — activity flood on pagination** — `fetchActivityHistory` had no limit when `cursor` was set, dumping all 500+ activities into every `loadMore` call and burying boss entries. Now limited to 50 per page when cursor-only (and moot with day-based pagination).
- **History page `hasMore` falsely false** — Initial `hasMore` was `result.length >= 50`, but the 2-day `since` filter could trim results below 50 even with hundreds of older records. Changed to `result.length > 0`.

## ✨ Enhancements

- **History timeline — attendance count** — Both boss kills and activity completions now show a `👤 N` attendance counter inline. Boss records use `attendance_records(id)` (already in the query); activities now include `activity_attendance(id)` in the nested select. Zero-attendance entries show `👤 0`.
- **Weekly Schedule — activity attendance & copy** — Completed activities now display a green `👤 N` attendance badge (matching the boss style). A copy button (clipboard icon) appears on activities with attendance — click to select as source, then click another completed activity to paste attendance. Blue banner and toast confirmations match the boss copy flow. ESC cancels copy mode.
- **Bot status indicator restyle** — The top-bar button now shows three distinct parts: a muted "RaidScout Bot" label (smaller, gray), a larger colored indicator dot with stronger glow, and a bold color-coded status word (green "Online", red "Offline", yellow for errors).

## 🔧 Internal

- **`copyActivityAttendance()`** — New function in `src/lib/api/activities.ts` copies `activity_attendance` records from one activity instance to another, skipping already-present members. Returns `{ copied, skipped }` counts.
- **Day-based history pagination** — `HistoryView.loadMore` now computes the oldest day in the loaded history and fetches the entire previous day via `since`/`until` scoping. `fetchHistoryFromSupabase` and `fetchActivityHistory` no longer rely on cursor logic for pagination.
