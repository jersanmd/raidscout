# August 27, 2026 — Changelog

## 🐛 Bug Fixes

- **Creating an Activity did nothing — broken since June 20** — Reported as "when they create an activity it does not add." The cause was entirely server-side, which is why it looked unrelated to any recent work: three copies of the `create_custom_activity` function existed in the database, and two of them accepted the **identical set of ten parameter names and types**, differing only in the order the parameters were declared.

  PostgREST invokes database functions with *named* arguments, where declaration order is irrelevant — so the client's call matched both copies equally well and Postgres refused to pick, failing with `42725: function ... is not unique` on every single attempt. Deterministic, not intermittent.

  The trap that created it: `CREATE OR REPLACE FUNCTION` only replaces a function whose signature matches **exactly**. Migration `089` (2026-06-20) moved `p_duration_minutes` from the sixth parameter position to the ninth, which Postgres reads as a *different* function — so instead of updating the existing copy, it silently added another one, and the collision was born. Two earlier copies had already arrived out-of-band, one of them from the loose `supabase/rpc_img.sql` / `fix_rpc_img.sql` files that sit outside `migrations/` and were run by hand.

  Fixed by dropping the two untracked copies and keeping the one migration `089` defines — the tracked version, so a future re-run of the migrations can't recreate the collision, and the only one whose body writes both `duration_minutes` and an explicit `template_id`. Also pinned `search_path` on it, which every other `SECURITY DEFINER` function in the schema already had.

  Verified after applying: exactly one overload remains; the probe that previously returned `42725` now resolves cleanly; and a full end-to-end call inside a deliberately-aborted transaction returned a new activity id and left no row behind. Creating a **boss** was never affected — `create_custom_boss` has only ever had one signature, which is why only activities broke. (`20260827000000_fix_create_custom_activity_ambiguity.sql`, applied.)

  No deploy required — the fix is entirely in the database and took effect immediately.
