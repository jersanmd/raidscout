# June 23, 2026 — Changelog (v0.15.8)

## 🐛 Bug Fixes

- **History page infinite scroll stuck at 2 days** — The `loadMore` cursor was broken in two ways: (1) it passed the initial 2-day `since` filter to every pagination call, capping results at the 2-day window; (2) `last.deathTime` was `undefined` for activity entries, causing the cursor to reset and re-fetch the same records. Fixed by removing `since` from `loadMore`, using `last.createdAt` (always defined) as the cursor, and passing the cursor through to `fetchActivityHistory` so both boss and activity queries paginate correctly.
- **History page `hasMore` falsely false** — Initial `hasMore` was `result.length >= 50`, but the 2-day `since` filter could trim results below 50 even with hundreds of older records. Changed to `result.length > 0` so the sentinel always offers to load more when any data exists; `loadMore` naturally sets `hasMore = false` when cursor-based queries return < 50.

## ✨ Enhancements

- **History timeline — attendance count** — Both boss kills and activity completions now show a `👤 N` attendance counter inline. Boss records use `attendance_records(id)` (already in the query); activities now include `activity_attendance(id)` in the nested select. Zero-attendance entries show `👤 0`.
- **Weekly Schedule — activity attendance & copy** — Completed activities now display a green `👤 N` attendance badge (matching the boss style). A copy button (clipboard icon) appears on activities with attendance — click to select as source, then click another completed activity to paste attendance. Blue banner and toast confirmations match the boss copy flow. ESC cancels copy mode.
- **Bot status indicator restyle** — The top-bar button now shows three distinct parts: a muted "RaidScout Bot" label (smaller, gray), a larger colored indicator dot with stronger glow, and a bold color-coded status word (green "Online", red "Offline", yellow for errors).

## 🔧 Internal

- **`copyActivityAttendance()`** — New function in `src/lib/api/activities.ts` copies `activity_attendance` records from one activity instance to another, skipping already-present members. Returns `{ copied, skipped }` counts.
- **`fetchActivityHistory` cursor support** — Now accepts and passes a `cursor` parameter to filter `end_time`, matching the death records pagination pattern.
