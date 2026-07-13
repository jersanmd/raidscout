# July 13, 2026 — Changelog (v0.15.2)

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

## 🔧 Fixes

- **`auto_resolve_auction` 400** — Missing `GRANT EXECUTE` to `anon`/`authenticated`. Migration `20260713000000_grant_auto_resolve_auction.sql` created.
- **DKP tables added to realtime publication** — Migration `20260713000001_dkp_realtime.sql` adds `dkp_auctions`, `dkp_bids`, `dkp_transactions` to `supabase_realtime`.
- **`full-copy.mjs` server_members fix** — Composite-key table now uses DELETE + row-by-row INSERT instead of generic upsert to avoid silent failures.

## 📦 Migrations (apply to both staging + production)

- `20260713000000_grant_auto_resolve_auction.sql`
- `20260713000001_dkp_realtime.sql`
