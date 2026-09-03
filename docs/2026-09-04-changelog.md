# September 4, 2026 — Changelog

## ✨ Improvements

- **Copying activity attendance now carries the party leader too** — The boss-kill copy on the weekly schedule started carrying party leaders on Aug 25; the parallel **activity** copy still left them behind. Same underlying shape as bosses: the leader was never on attendance rows, it lives on the instance (`activity_instances.party_leaders`, a per-guild `{guild_id → member_id}` map), so the target instance kept its own empty map and the Leader badge came up blank for the copied activity.

  Both copy paths now share one policy function (`mergePartyLeaders`, already unit-tested): fill only the guilds the target has no leader for, so a leader set on the target deliberately is never overwritten, and a re-copy where everyone was already present still completes the leaders. Written through the same RPC the participant modal's leader selector uses, so no new permissions. A failure in the leader step can never undo a successful attendance copy, and the toast now reports when leaders came along.

  Two further gaps in that path closed while there: the activity copy **wrote no audit entry** (the boss copy has always written one), and it **invalidated no caches at all** — it called the API directly rather than through a mutation, so copied attendance only surfaced on the next poll. It now writes an `attendance_copy` audit entry recording how many leaders were carried, and invalidates the target's attendance plus the instance lists that render the counts.

  Verified: the `set_activity_party_leaders` RPC was probed end-to-end inside a deliberately-aborted transaction (`{}` → written → rolled back, no residue); 311 tests passing; build clean.

## 🐛 Bug Fixes

- **Moderator permission changes were never logged** — `updateModeratorPermissions` returned early on the RPC success path, *before* its `writeAuditEntry` call. Since the RPC is deployed everywhere, the audit only ever ran on a legacy fallback that never executes — so `mod_perms_update` was written zero times. Confirmed against production: **0 audit rows despite 34 members holding active permission grants**, while every sibling action in the same "Roles" filter had entries. An owner filtering for permission changes saw a permanently empty list, and a moderator granting themselves DKP or points control left no trace. The audit now fires on both paths, and the action gained a label in the super-admin panel where it had none.

- **Item moderation left no record** — `approveItem` / `rejectItem` published or discarded community submissions into the shared game-wide catalog that every server reads, with no audit at all. `ITEM_APPROVE` and `ITEM_REJECT` were declared and filterable but never written, so those filters could only return empty. Both now record the item and moderator.

- **Unlinking a member left no record** — Accepting a claim is audited; revoking it was not, so the log showed claims granted and never revoked and an owner couldn't see who detached whom. Added `member_unlink`, labelled in both audit views.

- **Deleting a loot distribution left no record** — Awarding loot writes `ITEM_DISTRIBUTE`; deleting it wrote nothing, so loot could be granted and quietly erased while the log still claimed the player held it. Added `item_distribute_delete`, capturing the item, player and quantity before the row is gone.

- **Guild rename/delete went stale across seven views** — Adding, renaming or deleting a guild in Server Settings only updated that page's local state. `["guilds", serverId]` is read by gear tracking, inventory, DKP, analytics, member profiles, activity guilds and the upcoming-activities strip — all of which kept showing the old name (or a deleted guild) until their caches expired. All three handlers now invalidate.

- **Five invalidations that did nothing** — `ServerBossesActivitiesTab` invalidated `["activity-points"]` in five places after disabling, deleting or seeding activities. No query anywhere reads that key: the points matrix is fed by props from Server Settings' local state. The dead calls are removed rather than left implying a refresh that never happened.
