# June 22, 2026 — Changelog (v0.15.6)

## 🐛 Bug Fixes

- **AnalyticsView "Rendered more hooks" crash** — `guildKillTotals` useMemo and `guildSubItems` were declared after an early return (`if (isLoading || !data)`), causing hooks to run in different order across renders. Moved before the early return with optional chaining for the loading state.
- **Analytics `serverActivities` not in scope** — `serverActivities` and `serverActivityIds` were declared with `const` inside a `try` block but referenced in a second `try` block. Hoisted to `let` declarations before the first `try`.
- **Members -> Items Received bar overflow** — Bar height was unbounded (`(count/max) * 16`), causing bars to reach 128px+ when one time window vastly outnumbered another. Added `Math.min(24, ...)` hard cap and `overflow-hidden` on the card to prevent bars spilling past the "Items Received" label.
- **CP Trend last label off-screen** — The rightmost CP value label used `textAnchor="middle"`, causing half the text to overflow past the chart edge. Last data point now uses `textAnchor="end"` to keep text within bounds.
- **Point adjustment audit missing member name** — `adjustMemberPoints()` now stores `member_name` in audit entry details. Both Server Activity Log and Admin Panel audit tables render the name. Previously only showed points (e.g. "+5 pts" → "PlayerName: +5 pts — Bonus").
- **Audit log duplicate key errors** — `admin_audit_log_id_seq` sequence was out of sync with the `admin_audit_log` table, causing `duplicate key value violates unique constraint "admin_audit_log_pkey"` on every new audit write. Added migration `086_fix_audit_log_sequence` to resync the sequence.
- **BossListView spinner blocked on guilds** — Removed `guildsLoading` from the main loading gate. Boss cards and schedule now render immediately after boss/death data loads; guild badges populate asynchronously.
- **Weekly Schedule spinner stuck indefinitely** — Three `useEffect` hooks had conflicting `setPageReady` calls on mount. The `weekOffset` effect reset `pageReady` to `false` after the `deathRecordIds` effect set it to `true`. Fixed with `prevWeekOffset` ref comparison (Strict Mode safe) and a skip when `deathRecordIds` is empty (no attendance to fetch).
- **Weekly Schedule spinner stuck on week navigation** — Switching weeks on a server with zero death records left the "Fetching data..." overlay visible forever because `deathRecordIds.length` stayed `0` (no effect re-trigger) and the attendance query was disabled. The week-change effect now skips the overlay when there are no death records.
- **PayPal `paypalHost` build error** — Missing variable declaration broke Vercel production builds (`TS2304: Cannot find name 'paypalHost'`).

## 🔒 PayPal Security & Reliability

- **Order verification** — `paypal-ipn` edge function now calls PayPal's Orders API (`v2/checkout/orders/{id}`) to verify the order is `COMPLETED` before extending the subscription. Previously accepted any `order_id` from the client without server-side verification.
- **Idempotency** — Edge function now checks `payments` table for existing `paypal_order_id` before processing, preventing double-subscription from retries.
- **Amount validation** — Edge function validates the captured amount is ≥ $9.00 in USD before activating.
- **SDK improvements** — PayPal SDK URL now includes `components=buttons&disable-funding=credit,paylater` for proper card form loading. Added `onClick` handlers to clear stale errors. Added `landing_page: "BILLING"` and `brand_name: "RaidScout"` to `application_context`.
- **Decline messaging** — Card declines now show the PayPal decline reason with guidance to try a different card or PayPal checkout.
- **BillingView race condition** — `handlePaymentSuccess` now `await`s both `refreshServers()` and the payments query sequentially, preventing stale payment history after a successful purchase.

## 🎨 UI

- **Items Received card clicks to Loot History** — Clicking the Items Received stat card now smooth-scrolls to the Loot History section. Added `cursor-pointer` and hover background transition for affordance.

## 🤖 Discord Bot

- **`!updatestats` no longer auto-creates members** — Previously, if the member name didn't match, it would `POST` a new member row. Now returns: *"{name} does not exist. Make sure to enter the correct name or contact your guild officers."*
- **`!editstats` message updated** — Now shows the same "contact your guild officers" message instead of directing users to `!updatestats` to create a new entry.
