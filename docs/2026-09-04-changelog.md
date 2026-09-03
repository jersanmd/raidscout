# September 4, 2026 — Changelog

## ✨ Improvements

- **Copying activity attendance now carries the party leader too** — The boss-kill copy on the weekly schedule started carrying party leaders on Aug 25; the parallel **activity** copy still left them behind. Same underlying shape as bosses: the leader was never on attendance rows, it lives on the instance (`activity_instances.party_leaders`, a per-guild `{guild_id → member_id}` map), so the target instance kept its own empty map and the Leader badge came up blank for the copied activity.

  Both copy paths now share one policy function (`mergePartyLeaders`, already unit-tested): fill only the guilds the target has no leader for, so a leader set on the target deliberately is never overwritten, and a re-copy where everyone was already present still completes the leaders. Written through the same RPC the participant modal's leader selector uses, so no new permissions. A failure in the leader step can never undo a successful attendance copy, and the toast now reports when leaders came along.

  Two further gaps in that path closed while there: the activity copy **wrote no audit entry** (the boss copy has always written one), and it **invalidated no caches at all** — it called the API directly rather than through a mutation, so copied attendance only surfaced on the next poll. It now writes an `attendance_copy` audit entry recording how many leaders were carried, and invalidates the target's attendance plus the instance lists that render the counts.

  Verified: the `set_activity_party_leaders` RPC was probed end-to-end inside a deliberately-aborted transaction (`{}` → written → rolled back, no residue); 311 tests passing; build clean.
