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

- **The two Activity Log renderers had drifted apart** — Server Settings labelled 119 actions, the super-admin panel 86. The panel's copy was a stale fork, so ~35 action types rendered there as a raw `{"item_name":"…","winner_name":"…"}` key dump — including `dkp_item_distributed`, which has **1,082 rows in production** and was unlabelled in *both* views. Both now call one shared `formatAuditDetails`, so a new action can't be labelled in one view and forgotten in the other.

- **Bulk member transfer wrote to five tables silently** — Moving members between servers copied members, gear, distributions, notes and CP with no audit entry and no cache invalidation. The destination server's page kept showing its pre-transfer roster until the cache expired, and nothing recorded that members had arrived. It now writes one `member_bulk_add` per destination server and refreshes the roster, stats, gear and distributions.

- **Game catalog changes were invisible and unlogged** — Item categories, rarities, gear slots, gear-slot/category links and both template kinds (17 mutations across `games.ts` and `templates.ts`) are **game-wide** — they reach every server that seeds from that game — yet none of them wrote an audit entry. They now do, under six grouped actions (`game_taxonomy_*`, `game_template_*`) that carry the entity in a `kind` field rather than adding 17 near-identical filter rows. Deletes and renames read the row first so the entry names what was touched instead of echoing a UUID.

  The same edits were also invisible to the rest of the app: the Admin Games tab refreshed only its own local state, while the gear planner, member profiles, inventory filters and gear-tracking catalog read the same rows through React Query. A new gear slot or rarity stayed hidden everywhere else until a hard reload. Hiding a game — which removes it from the signup picker for every future server — is now logged too.

- **Rally screenshots on activities could be deleted without a trace** — The death-record path audits screenshot adds and removes; the activity path audited nothing. Separately, `rally_image_add` was declared, labelled and filterable but had written **zero rows ever**: the audit was gated on an optional `serverId` argument that no caller passed. Both paths now resolve the server the same way, so the action finally records something.

- **Renaming a server bypassed its own audited helper** — `updateServerName()` existed, audited the rename and threw on failure; Server Settings ignored it and issued a raw table update instead, which logged nothing *and* discarded the error — so a rejected rename still showed "Server name updated!" and left the sidebar desynced. Now routed through the helper, with the same treatment for the timezone save (new `updateServerTimezone`), which matters more: the Discord bot reads that value to resolve `!kill` and `!nextspawn` times.

- **Collection previews and claim decisions went stale** — Reordering or removing items in an inventory collection invalidated the editor list but never `allCollectionItems`, which backs the collection cards, so the previews kept the old contents. And accepting a claim binds a user account to a member row without refreshing `["members"]`, so the member kept showing as unclaimed — with no Unlink action — on the Members page.

- **Editing a death time didn't refresh the weekly grid** — Both death handlers invalidated `["death_records"]`, but the weekly schedule renders from `["deaths_in_window", …]`. Since an edit can move a kill into or out of the visible week, that's exactly the query that had to be invalidated.

- **Every point rule was logged twice** — `createPointRule` audited the insert and the Server Settings handler audited it again, producing two rows per rule: one with the guild name and hours, one with just the rule type. The API-level entry is now the only one, and takes the guild name so it's the complete one.
