# DKP Bid-War Load Test

Measures the rebuilt bidding path (broadcast events, denormalized auction state,
O(1) balances) under realistic contention.

**Never run this against the production project.** It places real bids and
moves real DKP. Use a Supabase branch (`supabase branches create loadtest`) or a
restored backup, and delete it afterwards.

## One-time setup on the TEST project

1. Create an active auction and note its id and server id.
2. Seed ~50 test bidders: auth users, claimed members on the target server,
   each granted DKP (insert `earn` rows into `dkp_transactions`; the balance
   trigger keeps `dkp_balances` current).
3. Sign each user in (`supabase.auth.signInWithPassword`) and write their JWTs
   to `scripts/loadtest/bidders.json`:

   ```json
   [{ "token": "eyJ...", "memberId": "uuid" }]
   ```

   JWTs expire (default 1 h) — regenerate before each run.

## Running the grid

```bash
for P in 50 100 250 500; do
  for R in 1 5 10 20; do
    k6 run scripts/loadtest/dkp-bid-war.js \
      -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... \
      -e AUCTION_ID=... -e SERVER_ID=... \
      -e PLAYERS=$P -e BIDS_PER_SEC=$R -e DURATION=3m \
      --summary-export "results-${P}p-${R}bps.json"
  done
done
```

## What to record per run

| Metric | Source |
|---|---|
| `bid_latency` p50/p95/p99 | k6 summary |
| `event_lag` p50/p95 (commit → client receipt) | k6 summary |
| `bids_accepted` / `bids_too_low` / `bids_conflict` / `bids_failed` | k6 counters |
| Database CPU %, peak connections | Supabase dashboard → Database |
| Realtime concurrent connections, messages/sec | Supabase dashboard → Realtime |
| API requests/sec, error rate | Supabase dashboard → API |

`bids_too_low` counts bids that lost the race to a concurrent higher bid — under
contention this is *correct behavior*, not failure. `bids_failed` is the real
error signal and its threshold is near zero.

## Pass criteria (the targets the redesign was built to)

- 250 players, 5 bids/sec sustained: `bid_latency` p95 < 1.5 s, `event_lag`
  p95 < 2 s, zero `bids_failed`, database CPU < 70 %.
- Realtime messages/sec ≈ players × bids/sec (one event per bid per client) —
  if it is a multiple of that, something is refetching.

## What this cannot measure

- The Pro plan's Realtime concurrent-connection and monthly-message quotas
  (dashboard/billing limits, not database behavior). Check the quota page
  against `players × 1` connections and `players × bids` messages per war.
- Browser-side render cost — k6 clients don't render. Spot-check with a real
  browser session during a run.
