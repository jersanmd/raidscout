# June 28, 2026 — Changelog (v0.15.11)

## 🤖 Discord Bot — Performance

- **Spawn cron optimizations** — Five changes to reduce tick duration spikes:
  - **Discord timeout** 20s→10s, retries 3→2 (prevents 60s hung ticks)
  - **Concurrency** 5→8 (~1.6× throughput for 30+ servers)
  - **RPC retry** before REST fallback (avoids 8× query explosion when `bot_server_snapshot` fails)
  - **Batched dedup notifications** — `spawn_notifications` POSTs now batched into 1 per tick instead of ~50 individual requests
  - **Adaptive interval** — Now uses last 10 ticks average with stepped formula `floor(avg/30s)×30s+30s` instead of 60-tick average with fixed 3 thresholds
- **persist-screenshot 401 fixed** — Bot was calling the edge function without `apikey`/`Authorization` headers. Added service role key auth.

## 🐛 Bug Fixes

- **Admin impersonation — stale build / reload loop** — `queueMicrotask(() => navigate("/"))` in the "View Server" button caused a timing gap between `setCurrentServer` and navigation, triggering Vite's "stale build detected" reload and MIME type errors when switching servers. Removed `queueMicrotask` — navigation now happens synchronously with the state update.
- **Member Profile — Notes hidden for viewers/non-staff** — Notes section and delete buttons now only visible to owners and moderators. Regular members and viewers see no notes UI.
- **Member Profile — Back button for viewers/non-staff** — "Back to Members" now navigates to the main Bosses/Activities tab for viewers and non-staff users, preventing broken history navigation from deep-linked profiles.
