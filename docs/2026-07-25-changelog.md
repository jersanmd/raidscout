# July 25, 2026 — Changelog

## 🐛 Bug Fixes

- **Zombie auctions showing "0 DKP no bid" after finalizing** — Before migration 190 (July 20), a race condition in `auto_resolve_auction` could set auctions to `'resolved'` while bid statuses rolled back to `'lost'`/`'cancelled'` with no winner marked. `getPastAuctions` would see bid_count > 0 but winner = null, displaying "0 DKP, 0 bids." Fixed with a one-time cleanup that marks the highest bid as `'won'` for affected auctions. Migration 190's stale-resolution guard prevents new occurrences.

## 🗄️ Database

- **Diagnostic** — `20260725000000_diagnose_zombie_auctions.sql` identifies resolved auctions with no winner bid
- **Fix** — `20260725000001_fix_zombie_auctions.sql` marks the highest bid as `'won'` for all affected auctions
