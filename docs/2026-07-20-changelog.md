# July 20, 2026 — Changelog

## 🐛 Bug Fixes

- **Batch auction finalization race condition** — Fixed a critical bug where items with many concurrent auctions could lose bidding history and winners during auto-resolution. When multiple auctions expired simultaneously, overlapping `auto_resolve_auction` calls could roll back already-resolved auctions, leaving them in a zombie state with missing bid data. Three changes close this:
  - `resolve_auction` now has a duplicate-resolution guard that returns early if the auction is already resolved, plus a graceful fallback (cancels remaining active bids) instead of raising an exception when a winner bid was already claimed by a concurrent call.
  - `auto_resolve_auction` wraps each auction's resolution in a `BEGIN/EXCEPTION` block so one failure cannot roll back the entire batch.
  - Bot cron now deduplicates expired auctions by `item_id` before dispatching — `auto_resolve_auction` already processes all expired auctions for an item, so sending 50 calls for the same item was wasteful and triggered the race.

## 🗄️ Database

- **Migration 190** — `190_fix_batch_resolve_race.sql` replaces `resolve_auction` and `auto_resolve_auction` with race-safe versions. Applied to both production and staging.

## 🧪 Testing

- **25 new unit tests** covering migration SQL structure, bot cron deduplication logic, and concurrency scenarios (already-resolved guard, winner-bid-already-taken fallback, exception isolation in batch loop).
