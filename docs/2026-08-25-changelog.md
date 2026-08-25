# August 25, 2026 — Changelog

## ✨ Improvements

- **Copying attendance now carries the party leader too** — On the weekly schedule, copying an attendance list from one dead boss to another copied only the member list. The party leader was left behind — not because the copy skipped a field, but because the leader never lived on attendance rows at all: it is stored on the death record itself, as a per-guild map (`death_records.party_leaders`, `{guild_id → member_id}`). The target death record kept its own empty map, so the Leader badge in the participant modal was blank for the copied kill and the weekly export's "Party Leader" column came up empty.

  The copy now merges the source kill's leaders onto the target death record — filling only guilds that have no leader yet, so a leader someone set on the target deliberately is never overwritten. It also completes leaders on a re-copy where all the members were already present, and the success toast says when leaders came along ("party leader carried over"). The audit entry records how many were copied. A failure in the leader step can never undo a successful attendance copy.

  Not included, deliberately: the anonymous-viewer copy path (viewers cannot write to death records, and the copy button is staff-only anyway), and the parallel **activity** copy — activities keep their leaders on `activity_instances.party_leaders` and their copy has the same gap; say the word and it gets the same treatment.

No database changes — the leader map and the write path it uses (the same one the participant modal's leader selector uses) already existed.

- **Per-guild checked counter in the participants modal** — Each guild header in the attendance modal now shows a ✓ N badge counting that guild's checkmarked members (green when non-zero, with "N of M members checked" on hover), so staff can verify a guild's headcount at a glance instead of counting checkboxes. The count updates live as boxes are toggled, covers the "No Guild" group too, and is deliberately counted over the guild's full roster — typing in the member search box narrows the visible list but never changes the counter.
