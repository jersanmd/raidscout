# August 24, 2026 — Changelog

## 🐛 Bug Fixes

- **"Bidding has ended" with 9 seconds still on the clock** — Reported with a screenshot: two auction rows counting down 00:00:09 and 00:00:16, the bid modal saying "1min left" with the button enabled, and the server refusing the bid. Reconstructed from the database (`Black Thorn Leather Pants`, resolved Aug 23 13:36 UTC): the server was right — the deadline had passed. The player's device clock was running ~10–20 seconds behind, and every countdown in the app was computed from the device clock while `place_bid` enforces the deadline on the database clock. The modal made it worse by rounding 9 seconds up to "1min left".

  Countdowns on the DKP page now render **server time**. The client samples the database clock (new `get_server_time` RPC) on page mount, on realtime reconnect, and when the tab returns to the foreground — the moments a device clock is most likely to have jumped — and refines the offset for free from the `ts` field every bid broadcast already carries. Since every sample source underestimates the true offset (by network latency, i.e. in the direction that shows *more* time than exists), samples merge as a max, an authoritative RPC sample resets the baseline outright, and displayed remaining time carries a 1-second pessimistic margin computed in exactly one place — so the row countdown, progress bar, "Finalizing" flip, bid button, theater, and modal can never disagree with each other or re-invite this bug. If the time sample fails, the device clock remains the silent fallback and the server still arbitrates.

  The bid modal now shows a live, second-precise countdown (the same component the rows use) instead of a once-per-fetch ceil-to-minutes figure, and disables Place Bid exactly when the corrected clock reaches zero — not earlier, deliberately: a legitimate last-second bid is supposed to trigger the 180–300 s soft-close extension, so no artificial early cutoff was added.

  Deadline enforcement is unchanged — the server was already correct; this makes the UI stop contradicting it. Boss and schedule timers intentionally keep the device clock: nothing server-side refuses an action at those deadlines, and they can adopt the same corrected clock later as a separate change.

## 🗄️ Database

- `20260824000000_get_server_time.sql` — one `STABLE` function returning `now()`, `EXECUTE` for `authenticated` only. Applied.
