# July 21-22, 2026 — Changelog

## ✨ New Features

- **Cross-server player transfer** — Staff can move players between servers from `/members-summary`. Search multiple players, bulk-assign target server & guild, and transfer with one click. Copies CP history, gear, and loot distribution to the new server. Soft-deletes source (unset guild) so all data stays recoverable if the player returns.
- **Bulk assign** — "Apply to all" section in the transfer modal sets the same server + guild for every player at once. Guild dropdown only shows guilds from the selected server.

## 🎨 UX Improvements

- **Server transfer notice** — Amber warning in the server selector explains that transfers are limited to selected servers' guilds.
- **Data refresh after transfer** — Page refreshes without resetting server selection.
- **Soft-deleted members hidden** — Members with `guild_id = null` (transferred out) are excluded from summary views.
- **Navbar shows claimed character name** — Top bar and dropdown show in-game character name instead of email prefix.

## 🐛 Bug Fixes

- **DKP distribute `distributed_by` NOT NULL** — `AuctionList` now receives `userId` prop and passes it to `createDistribution`.
- **DKP distribute label not updating** — Added `dkp_distributed` to realtime subscription + publication.
- **Auction history infinite render fix** — Moved hooks before early return in `AuctionList`.
- **Duplicate item name error** — Friendly alert instead of raw Postgres error.
- **Distributions `reason` NOT NULL** — Transfer defaults empty reason to `"Transferred"`.
- **Gear duplicate slot fix** — Deletes existing gear on target before inserting to prevent UNIQUE `(member_id, slot_id)` conflicts from previous transfers.
- **Transfer summary logging** — Console now shows per-player counts: `Success: Name (CP:5, gear:6, loot:12)`.

## 🧪 Tests

- **7 unit tests** for server transfer logic — covers single/multiple transfers, missing targets, DB errors, mixed results, exceptions, and console logging.
