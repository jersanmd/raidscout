# August 23, 2026 — Changelog

## ⚡ Bidding rebuilt for live auction wars

The DKP bid path scaled as `players × bids/sec`: every bid, on any of the 45 servers, was broadcast to every connected client through four unfiltered postgres_changes listeners, and every client answered by invalidating up to nine query keys and firing ~5 HTTP refetches. The audited ceiling was roughly 100 simultaneous players. The flow is now: one atomic transaction → one compact broadcast event on the server's private topic → clients update local state with zero refetches.

- **One event instead of five refetches** — `place_bid` returns and broadcasts a single payload carrying the complete post-bid auction state (new highest, bidder, count, extended deadline, who was refunded what). A pure, unit-tested reducer applies it directly to the React Query caches; balance and ledger are refreshed only for the two members the bid actually touched. The bidder's own RPC response applies the same event instantly, and the broadcast echo dedupes by bid count.
- **Realtime scoped to the server** — clients join one private `dkp:<server_id>` broadcast topic; membership is authorized once at channel join via an RLS policy on `realtime.messages`, instead of per-subscriber-per-row policy checks on every WAL change. The four DKP tables left the `supabase_realtime` publication. Rare lifecycle events (auction created / resolved / bid cancelled) broadcast a `sync` beat that triggers one targeted refetch.
- **If the channel drops, the auction list degrades to a 15-second poll** instead of silently going stale, and the status pill shows it.

## 🐛 Bug Fixes

- **A lower bid could steal the auction** — `place_bid` only checked `amount >= dkp_cost` and unconditionally refunded + dethroned the previous highest bidder, so bidding the minimum against a 100-DKP leader displaced them. Bids must now strictly exceed the standing highest; a losing race returns `BID_TOO_LOW` with the number to beat.
- **Cross-auction DKP overspend race** — the function locked the auction row but read the balance without locking it, so one member bidding concurrently on two auctions could spend the same DKP twice. The member's balance row is now locked (`FOR UPDATE`) before validation; concurrent spends serialize and the second bidder sees the first deduction.
- **Distinct bid errors instead of "Failed"** — too low (with the current highest), insufficient DKP (with the available amount), auction closed, not eligible, guild-restricted, concurrent-conflict (retryable, refreshes the auction), and network failure are now told apart in the UI.

## 🗄️ Database (3 migrations — applied and verified in production)

- `20260823000000_dkp_bidding_scalability_schema.sql` — `dkp_balances` view → real table maintained by a ledger trigger (balance checks drop from aggregating a member's full history — 1,500+ rows for heavy members — to a single-row lookup; the ledger stays the source of truth and nothing is deleted). Denormalized `highest_bid` / `highest_bidder_id` / `bid_count` onto `dkp_auctions`, backfilled. Two indexes shaped like the bid path: partial `(auction_id, member_id) WHERE status='active'` and `(auction_id, bid_amount DESC)` — the old lookup scanned 775 index entries to find 1 row.
- `20260823000001_dkp_bidding_scalability_rpcs.sql` — `place_bid` v3 (returns/broadcasts the bid event; both fixes above; soft-close unchanged and still atomic under the auction lock), `cancel_bid` keeps the denormalized state true, `resolve_auction` / `mark_item_for_bid` emit sync beats, the `realtime.messages` join policy, publication trim, and `EXECUTE` revoked from `anon` on the bid RPCs (the old `place_bid` was anon-executable — unexploitable since `auth.uid()` is null, but wrong).
- `20260823000002_dkp_rls_dedupe.sql` — drops two literal-duplicate RLS policies and one strict-subset policy; every surviving policy is textually equivalent or a superset, so security semantics are unchanged.

**Verified after applying:** all 87 balance rows match their ledger sums exactly; all 155 active auctions' `highest_bid` agree with the live bids; the balance read on the heaviest member dropped from 1,079 buffers / 12.7 ms to 1 buffer / 0.12 ms; the previous-highest lookup now reads 1 row through the new partial index instead of scanning 775 entries; no DKP tables remain in the realtime publication; a test `realtime.send` went through cleanly. The old frontend bundle keeps working against the migrated database (it ignores `place_bid`'s return value) but only gets live bid updates once the new bundle deploys.

## 🔁 Polling reductions

Layout-mounted widgets polled on every page, for every user, forever: claim badge 30 s → 120 s (its realtime subscription is the primary signal), claim notification check 30 s → 120 s + skipped in hidden tabs, bot status 30 s → 60 s + skipped in hidden tabs. Activity instances 2 s → 10 s, matching the boss/death cadence.

## 🧪 Load-test kit (not yet run)

`scripts/loadtest/` — k6 scenario driving N spectators on the realtime topic plus a constant-rate bid stream (grid: 50–500 players × 1–20 bids/sec), measuring bid latency percentiles, commit-to-client event lag, and acceptance/race/failure counts. **Must run against a Supabase branch, never production.** Capacity numbers stay estimates until it runs.
