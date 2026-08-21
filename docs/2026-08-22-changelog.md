# August 22, 2026 — Changelog

## 🐛 Bug Fixes

- **Renaming a member emptied their collection ownership** — Reported from `/inventory?tab=collections`: after a rename, the player's row in the ownership matrix showed a dash in every column while a second row under their old name held all the "Owned" labels. Manual overrides and distributions both identify a player by `player_name`, recorded as it stood when the row was written, so a rename left everything they owned filed under a name nothing looks up any more. Clicking a cell on the live row couldn't clear the ghost either — the delete was keyed by the current name and matched nothing.

  Two members on Yvonne 1 were affected: `ronnie20` → `Ronnie20`, which stranded 6 of 7 distributions and 2 of 3 overrides, and `一天三五千一个月十来万` → `Theadril`, which stranded all 3 distributions and all 8 overrides. Ownership is now keyed on the member rather than the name, so it follows a rename in both directions.

- **Distributing or deleting an item left the History tab stale** — The history list is built by walking backwards a day at a time and is held outside the query cache, so no mutation ever refreshed it. A newly distributed item didn't appear and a deleted one stayed on screen until the page was reloaded. Distributing now re-walks the days; deleting removes the row in place, so the pages already scrolled into view stay loaded.

- **Searching History found nothing older than the last loaded page** — The search box filtered only the handful of distributions already fetched, and disabled paging while active, so anything further back reported "No matches" even though it was in the database. Search now queries the server: item names are resolved to ids client-side and player names matched with `ilike`, and the rarity chips compose with the text search across the whole history.

- **Rarity filters never appeared on the catalog, and items rendered grey** — Both the filter chips and the rarity colour map were derived from a query deliberately disabled while the catalog tab is showing, so the chips only appeared if you happened to visit another tab first, and rarity colours fell back to grey almost everywhere. The rarity list is now loaded whenever a server is selected.

- **The Pending filter reset itself on "Load More"** — Paging a filtered catalog re-fetched without the filter, mixing approved items back into a pending-only list; the debounced search dropped it the same way. Catalog filters now live in one place that every fetch reads. Rarity filtering also moved server-side, so the "50 of 300" count matches what the filter is actually showing.

- **Servers past 1,000 rows silently lost data** — `fetchItems`, `fetchDistributions` and `fetchServerDistributions` each fetched unbounded, and PostgREST truncates a response at 1,000 rows. Past that ceiling items dropped out of the lookup and rendered as "Unknown Item" in History, while Recipients, Analytics and the ownership matrix quietly undercounted. All three are paginated now, each with a stable secondary sort so paging can't skip or repeat a row.

- **Deleting a distribution often failed to clear the auction's "Distributed" marker** — The delete read the auction id back out of component state, but the confirmation dialog closes in the same click, so by the time the request ran the id had usually gone and the cleanup was skipped. It travels with the mutation now.

- **Expired servers crashed Inventory, History, Members and Leaderboard** — The expiry gate returned early from the middle of each view, ahead of dozens of hooks. `currentServer` resolves asynchronously, so a server that turns out to be expired changed the hook count between the first and second render and React threw "rendered fewer hooks than expected" instead of showing the gate. The check moved into a wrapper with a fixed hook count on all four pages.

- **Recipients ignored the sort for members with no items** — Members who had received nothing were appended after the list was sorted, pinning them to the bottom in arbitrary order whatever sort was chosen. The tab also grouped on `player_name`, so a renamed player appeared as two half-populated rows; it groups on member id now.

- **Analytics plotted distributions on the wrong date** — "Items Distributed per Day" bucketed on `created_at`, the row's insert time, rather than `distributed_at`. Backfilled records landed on the day they were imported instead of the day the loot was handed out.

- **History day boundaries were UTC while the list grouped by local date** — For any offset timezone the two disagreed, so a distribution made after local midnight was fetched under one day and displayed under another. At UTC+8 that covered every distribution between midnight and 8am. Day fetching now uses local bounds; verified against UTC+8, UTC, UTC−4 and UTC+14, and across both DST transitions.

## 🗄️ Database

- **Fix** — `20260822000000_link_collection_ownership_to_members.sql` adds `member_id` to `item_collection_manual_ownership` and backfills it two ways: from the member whose current name still matches, and — for names that no longer match anyone — from `distributions`, which records both the name used at the time and the member id behind it. That second path is what recovers a full rename like `一天三五千一个月十来万`; a name match alone would never find it.

  Rows for players who are no longer members of the server keep a `NULL` `member_id` and stay keyed by name, which is already how the matrix displays them, and the foreign key is `ON DELETE SET NULL` so removing a member doesn't delete the overrides recorded for them. Where a rename left one player holding two overrides for the same item, the more recent `set_at` wins. The new unique index is deliberately non-partial: PostgREST names an upsert conflict target by column list and can't restate an index predicate.

  On staging: 1,553 rows, 1,055 linked to a member, 498 left name-keyed, 1 superseded row merged away. Verified afterwards with no member split across two names, no stale cached names, no duplicate overrides and no dangling references. Applied to staging and production.

## 🚀 Deploy

Needs a Vercel deploy. The migration must be applied before the client ships — the client now writes `member_id`, and the Inventory collections tab keeps showing renamed players as two rows until the new code is live.
