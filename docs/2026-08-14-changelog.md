# August 14, 2026 — Changelog

## 🐛 Bug Fixes

- **Checking attendance after finalizing added no leaderboard points** — Staff mark attendance in batches days after a kill, but Finalize snapshots immediately. Since the Aug 8 fix the live board scores a kill by when it *happened* (`death_records.death_time`) rather than when the row was written, so attendance entered after a guild finalizes, for a kill that predates the cutoff, was credited nowhere at all: not on the live board (the kill sits outside the current window) and not in the snapshot (that was taken before the row existed). DKP still moved, which is how it surfaced — staff saw a member's DKP rise while their leaderboard points stayed put.

  Late attendance now mints a point adjustment in the **current** period worth exactly what the kill would have scored — same per-guild override and time multiplier the leaderboard applies. Players get their points, the live board moves, and the already-published snapshot is never rewritten. The credit is linked to the attendance row that earned it, so un-checking attendance withdraws it automatically and re-adding it can never pay twice.

  On SVEN 1 this covered 314 check-ins across 36 members and 18 kills (1,768 points). Yvonne 6 and Medea 4 - Divine had 90 and 7 stranded rows; all 411 were backfilled, each into the period it was always meant for.

- **Leaderboard edge function scored almost no boss points** — The fallback path fetched every death record in one `.in()` call over the full id list, which PostgREST silently truncates at 1,000 rows. Most kills never made it into the lookup and were skipped outright, so this path returned little more than each member's point adjustments. The id list is now chunked and paginated, and the fallback agrees with the `get_leaderboard` RPC exactly for the first time.

- **Edge function ignored the reset date for point adjustments** — It summed every adjustment ever recorded on a server regardless of period, and fetched them unpaginated. Adjustments are now paginated and gated by the same per-guild cutoff that gates kills.

- **Timestamp comparisons in the edge function compared the wrong characters** — Reset dates are stored as `2026-08-09T17:22:00.000Z` while PostgREST returns `2026-08-09 13:36:02.373+00`. Comparing those two formats with a raw string `<` compares the space against the `T`, not the times. Now compared as `Date` objects.

## 🗄️ Database

- **Fix** — `20260814000000_credit_late_attendance_to_current_period.sql` adds `point_adjustments.attendance_record_id` (FK, `ON DELETE CASCADE`) with a partial unique index, adds an `AFTER INSERT` trigger on `attendance_records` that mints the credit, and backfills the 411 stranded rows. The trigger sits on the table rather than in the app because attendance has three insert paths — the staff upsert, `viewer_add_attendance`, and the bulk copy-to-death helper. `adjusted_by` becomes nullable so system-minted credits aren't attributed to a person; `fetch_point_adjustments` renders those as "System".
- **Fix** — `20260814000001_suppress_late_attendance_credit_when_kill_back_in_window.sql` stops a credit from double-counting when the kill it compensates for returns to the scoring window. `delete_leaderboard_snapshot` moves the reset *backward* — to the previous snapshot's `finalized_at`, or removes it entirely — so staff deleting a mis-timed finalize and redoing it would otherwise pay those members twice (1,768 points on SVEN 1). A credit tied to an attendance row now only counts while that row's kill is outside the window, which self-corrects in both directions and keeps the credit correctly absent from any snapshot whose period contains the original kill.
- Redeployed the `get-leaderboard` edge function with the pagination, reset-filtering, and date-comparison fixes.

## 💬 Wording

- **Late-attendance credits named which date they were showing** — The label read "Late attendance — Shuliar Lvl 95 on Aug 09, 07:57 PM", which looked wrong next to an Aug 10, 1:22 AM cutoff. That timestamp is when the *boss was killed*, and it is necessarily before the cutoff — a kill after the cutoff scores normally and never needs a credit. Now reads "Late attendance — Shuliar Lvl 95, killed Aug 09 07:57 PM", with the credit's own date printed beside it as before. All 411 existing credits relabelled; point values untouched. (`20260814000002_clarify_late_attendance_credit_label.sql`)

## ⚠️ Known Limitation

- Points land in the period they were *entered*, not the period the kill happened in. A kill from last week checked in today shows up on this week's board. This keeps published results stable at the cost of exact period attribution — amending the snapshot instead would change results the guild has already announced.
