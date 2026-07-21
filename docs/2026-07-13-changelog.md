# July 13-21, 2026 — Changelog (v0.15.2)

## ✨ New Features — Server Transfer

- **Cross-server player transfer** — Staff can move players between servers from `/members-summary`. Search multiple players, bulk-assign target server & guild, and transfer with one click. Copies CP history, gear, and loot distribution to the new server. Soft-deletes source (unset guild) so all data stays recoverable if the player returns.
- **7 unit tests** for server transfer logic — covers single/multiple transfers, missing targets, DB errors, mixed results, exceptions, and console logging.

## 🎨 Members Summary — UX

- **Server transfer notice** — Amber warning in the server selector: "Server transfers are only available to guilds on the servers you select below."
- **Data refresh after transfer** — Page refreshes without resetting server selection (uses `refreshKey` instead of toggling `configured`).
- **Soft-deleted members hidden** — Members with `guild_id = null` are excluded from summary views.

## ⚡ Performance — Realtime DKP

- **DKP switched from polling to Supabase Realtime** — Replaced all `refetchInterval` polling (5 queries at 1-30s intervals) with WebSocket push subscriptions on `dkp_auctions`, `dkp_bids`, and `dkp_transactions`. Zero background HTTP requests after initial load. Changes push instantly to all connected browsers.
- **AuctionTheater 1s polling removed** — Theater view now receives realtime updates instead of hammering the API every second.
- **QueryClient global defaults** — Added `staleTime: 30s`, `refetchOnWindowFocus: false`, `retry: 1` to prevent API storms on tab switches. Removed individual `refetchOnWindowFocus: true` overrides from `useBosses`, `useDeathRecords`, `useAttendance`.
- **Small compute upgrade** — Upgraded from Micro to Small (dedicated CPU, 2-4 PostgREST workers). Concurrent bidder capacity: ~50-60 → ~100-150.

## 🏆 Leaderboard "Since Reset" Fix

- **"Since Reset" now uses RPC per-guild reset** — Previously subtracted snapshots from all-time points, causing 0pt when snapshots had all-time totals. Now delegates entirely to the `get_leaderboard` RPC which applies `leaderboard_reset_at:{guild}` from `app_settings` when `p_since` is NULL.
- **Finalize chains snapshots** — Each finalize now starts from the previous snapshot's `finalized_at` (or server `created_at` for the first), instead of using epoch. Prevents snapshots from capturing all-time totals.
- **Fixed `resetAt` → `since` variable rename** — The earlier refactor left a stale reference causing "Failed to finalize."

## 🎨 DKP UI

- **DKP History collapsible** — Default collapsed with "Show" button. Click header to expand/collapse.
- **Auction History taller** — Increased from `max-h-96` (384px) to `max-h-[600px]`.

## 🐛 Bug Fixes

- **`auto_resolve_auction` 400** — Missing `GRANT EXECUTE` to `anon`/`authenticated`. Migration `20260713000000_grant_auto_resolve_auction.sql` created.
- **DKP tables added to realtime publication** — Migration `20260713000001_dkp_realtime.sql` adds `dkp_auctions`, `dkp_bids`, `dkp_transactions` to `supabase_realtime`.
- **`full-copy.mjs` server_members fix** — Composite-key table now uses DELETE + row-by-row INSERT instead of generic upsert to avoid silent failures.
- **DKP distribute intermittent failure** — `createDistribution` was calling `supabase.auth.getUser()` (server round-trip), which could return null on production under load. Changed to accept `distributed_by` from AuthContext (local JWT, no server call). Affected DKP distribute + InventoryView distribute.
- **Duplicate item name error** — `AdminGamesTab` now shows a friendly "An item named 'X' already exists" alert instead of raw Postgres error.
- **Auction history search now matches winners** — Search also matches `winner_name`, not just item names. Placeholder updated to "Search items or winners..."
- **Auction history infinite render fix** — Moved hooks before early return in `AuctionList` to prevent "Rendered fewer hooks than expected" crash.
- **DKP distribute `distributed_by` NOT NULL** — `AuctionList` now receives `userId` prop from `DkpContent` and passes it to `createDistribution`.
- **DKP distribute label not updating** — Added `dkp_distributed` to realtime subscription + publication. When an item is marked as distributed, the Auction History now updates instantly.

## ✨ New Features — DKP

- **Duplicate live auction** — Staff can click "Duplicate" on any live auction item to open the Mark modal pre-filled with the same item, DKP cost, quantity, guild, and end date/time. Creates a new auction with zero bids.
- **User timezone on DKP page** — All auction end times now display in the user's personal timezone (globe dropdown next to Sign Out) instead of server timezone.
- **Live auctions sorted by remaining time** — Items now sorted by `bid_end_time` ascending (shortest time first), enforced client-side.
- **Navbar shows claimed character name** — Top bar and dropdown now display your claimed in-game character name instead of email prefix. Falls back to email if no character claimed.

## 📦 Migrations (apply to both staging + production)

- `20260713000000_grant_auto_resolve_auction.sql`
- `20260713000001_dkp_realtime.sql`
