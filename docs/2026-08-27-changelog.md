# August 27, 2026 — Changelog

## 🐛 Bug Fixes

- **Creating an Activity did nothing — broken since June 20** — Reported as "when they create an activity it does not add." The cause was entirely server-side, which is why it looked unrelated to any recent work: three copies of the `create_custom_activity` function existed in the database, and two of them accepted the **identical set of ten parameter names and types**, differing only in the order the parameters were declared.

  PostgREST invokes database functions with *named* arguments, where declaration order is irrelevant — so the client's call matched both copies equally well and Postgres refused to pick, failing with `42725: function ... is not unique` on every single attempt. Deterministic, not intermittent.

  The trap that created it: `CREATE OR REPLACE FUNCTION` only replaces a function whose signature matches **exactly**. Migration `089` (2026-06-20) moved `p_duration_minutes` from the sixth parameter position to the ninth, which Postgres reads as a *different* function — so instead of updating the existing copy, it silently added another one, and the collision was born. Two earlier copies had already arrived out-of-band, one of them from the loose `supabase/rpc_img.sql` / `fix_rpc_img.sql` files that sit outside `migrations/` and were run by hand.

  Fixed by dropping the two untracked copies and keeping the one migration `089` defines — the tracked version, so a future re-run of the migrations can't recreate the collision, and the only one whose body writes both `duration_minutes` and an explicit `template_id`. Also pinned `search_path` on it, which every other `SECURITY DEFINER` function in the schema already had.

  Verified after applying: exactly one overload remains; the probe that previously returned `42725` now resolves cleanly; and a full end-to-end call inside a deliberately-aborted transaction returned a new activity id and left no row behind. Creating a **boss** was never affected — `create_custom_boss` has only ever had one signature, which is why only activities broke. (`20260827000000_fix_create_custom_activity_ambiguity.sql`, applied.)

  No deploy required — the fix is entirely in the database and took effect immediately.

## 🔒 Security

- **Nine database functions were callable by anyone, unauthenticated** — Found while fixing the activity bug. Nine `SECURITY DEFINER` write RPCs were executable by the `anon` role — the public key that ships in the browser bundle — and none of them verified the caller. Being `SECURITY DEFINER`, they also bypass row-level security, so table policies were not a fallback. The worst two: `create_moderator_permissions` (unauthenticated privilege escalation) and `delete_leaderboard_snapshot` (unauthenticated destruction of finalized results); the rest could create, edit or delete bosses, activities, static parties and member stats on any server.

  `EXECUTE` is now revoked from `anon` and `PUBLIC` on all nine, and granted explicitly to `authenticated`. Nothing legitimate breaks: every caller lives in the authenticated web app, logged-out viewer flows use the separate `viewer_*` RPCs, and the Discord bot runs as `service_role`. Two of the nine (`create_moderator_permissions`, `update_member_stats`) have no caller in the codebase at all. (`20260827000001_revoke_anon_on_staff_write_rpcs.sql`, applied and verified.)

  **Correction:** I initially listed `create_moderator_permissions` among these as "unauthenticated privilege escalation." It is not — it is a *trigger* function on `server_members` (zero arguments, uses `NEW`), so it has no callable attack surface. The revoke was harmless and the trigger was verified still firing afterwards, but the severity claim was wrong.

- **Cross-server writes closed too** — The revoke above stopped *unauthenticated* callers, but an authenticated user of server A could still call these for server B: they accept a `server_id` (or a row id) and never checked membership, and `SECURITY DEFINER` meant RLS wasn't a fallback either. All eight callable RPCs now require owner/moderator on the server the target belongs to, via a shared `assert_server_staff()` helper. Where the server isn't a parameter it's derived from the target row (activity, boss, member, party), and a missing target raises rather than silently doing nothing. `service_role` bypasses, so the Discord bot and cron are unaffected.

  Every replacement reproduces its deployed argument list byte-for-byte, defaults included — changing a parameter's order or type would have added an *overload* instead of replacing the function, which is precisely the fault that broke activity creation for two months. Verified after applying: still exactly one overload each, and a three-way probe confirmed `service_role` bypasses, real staff on their own server are allowed, and the same staff against another server are denied. (`20260827000002_staff_checks_on_write_rpcs.sql`, applied.)

## 🧹 Housekeeping

- **Quarantined the loose SQL files** that caused the activity outage — `rpc_img.sql`, `fix_rpc_img.sql`, `all_rpcs.sql`, `all_rpcs_extra.sql`, `FIX_LEADERBOARD.sql` and `apply-migrations-018-023.sql` sat at `supabase/` root, outside `migrations/`, defining stale versions of live functions. Two of them were run by hand against production and planted the duplicate that broke activity creation. They now live in `supabase/adhoc-archive/` behind a README explaining the `CREATE OR REPLACE` trap, the rule that schema changes belong in `migrations/`, and a query that detects this class of problem before users do. The four files left at `supabase/` root (`seed.sql`, `seed_audit_log.sql`, `old_data.sql`, `clean_staging.sql`, `cleanup_forcespawn_guilds.sql`) were checked and define **zero** functions, so they carry none of this hazard.

- **Activity guild badges went stale on the upcoming-activities strip** — `UpcomingActivitiesStrip` read its activity-guild data under the query key `activity_guilds` (underscore) while every other reader and all ten invalidators use `activity-guilds` (hyphen). Two spellings meant two separate cache entries for the same data, so edits made in Server Settings never reached the strip and its guild badges kept showing the old assignments until an unrelated refetch. Both outliers now use the hyphenated key.
