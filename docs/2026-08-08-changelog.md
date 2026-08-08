# August 8, 2026 — Changelog

## 🐛 Bug Fixes

- **"Since Reset" leaderboard didn't match Finalized results** — The live "Since Reset" leaderboard filtered boss kills by `attendance_records.created_at` (when the row was written to the database), while Finalize correctly filtered by `death_records.death_time` (when the kill actually happened). Any attendance row added, corrected, or re-matched after a guild's reset date — even for kills that happened, and were already paid out, before the reset — inflated the live totals inconsistently per member. Both now consistently use kill time.
- **Point adjustments not bounded by Finalize cutoff** — `point_adjustments` had no upper-bound filter, unlike boss/activity points, so an adjustment made after a chosen Finalize cutoff (but before the button was clicked) could leak into the snapshot. Now bounded the same way.
- **Member detail modal always showed all-time totals** — Clicking into a member's row on the leaderboard opened a breakdown modal whose activity-history fetch ignored the reset-date cutoff entirely, so it always summed a member's full history instead of just the current period. This made the modal disagree with the main list even after the fixes above.
- **Member detail modal's kill total still didn't match the main list** — Even after the fixes above, clicking into a member still showed an inflated point total. Traced to `get-member-kills`, the edge function powering that modal's kill list, which also filtered by `attendance_records.created_at` instead of `death_records.death_time`. The checked-in source already had the correct filter, but the deployed function had never been redeployed with it — redeployed now, and the modal matches the main list exactly.

## 🗄️ Database

- **Fix** — `20260808000000_fix_leaderboard_reset_time_basis.sql` recreates `get_leaderboard` to filter consistently on `death_time`/`end_time` and bound `point_adjustments` by `p_until`.
- Redeployed the `get-leaderboard` edge function (RPC fallback path) with the matching fix.
- Redeployed the `get-member-kills` edge function to pick up an already-correct fix that was sitting undeployed.
