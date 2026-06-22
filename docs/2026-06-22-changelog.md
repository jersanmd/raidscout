# June 22, 2026 — Changelog (v0.15.7)

## � UI

- **Demand CP Update — toggle Discord servers** — The confirmation modal now shows clickable per-server toggles. Click a server to exclude it from receiving the progress thread (grayed out with strikethrough, ❌ icon). Excluded `progress_channel_id`s are passed to the edge function so threads are only created in selected servers.
- **Member Profile — Back button uses history** — "Back to Members" / "Back to RaidScout" now uses `navigate(-1)` instead of a hardcoded path, preserving search/filter/guild context from the previous page.

## 🐛 Bug Fixes

- **Member Profile — dailyActivity trend chart timezone drift** — The trend chart used `Date.now()` (UTC) for its 7-day and 30-day windows, while the Events stat card used `weekStart`/`monthStart` (server timezone). For a UTC+8 server, "7d" could show June 16–23 instead of June 21–27. Now uses `weekStart.getTime()` for 7d and `monthStart.getTime()` for 30d.
- **AnalyticsView "Rendered more hooks" crash** — `guildKillTotals` useMemo and `guildSubItems` were declared after an early return, causing hooks to run in different order across renders. Moved before the early return.
- **Analytics `serverActivities` scope bug** — `serverActivities` and `serverActivityIds` were `const` inside a `try` block but referenced in a second `try`. Hoisted to `let`.
- **Member Profile — Items Received bar overflow** — Bar height was unbounded, causing 128px+ bars when one time window vastly outnumbered another. Added `Math.min(24, ...)` cap and `overflow-hidden`.
- **Member Profile — CP Trend last label off-screen** — Rightmost CP label used `textAnchor="middle"`. Last point now uses `textAnchor="end"`.
- **Member Profile — Items Received card clickable** — Clicking the Items Received stat card smooth-scrolls to the Loot History section.
- **DkpView.tsx stale HMR cache** — Removed nonexistent `DkpView.tsx` causing Vite babel parse errors. File wasn't imported anywhere.

## 🤖 Discord Bot

- **`!updatestats` no longer auto-creates members** — Previously POSTed a new member row on miss. Now returns: *"{name} does not exist. Make sure to enter the correct name or contact your guild officers."*
- **`!editstats` message updated** — Same "contact your guild officers" message instead of directing to `!updatestats`.

## �🏆 Leaderboard Finalization & History

- **Finalize respects user-entered datetime** — The finalize modal's datetime picker now correctly converts the entered local time to UTC before saving. Previously used a broken offset calculation that wrapped around midnight for timezones ahead of UTC (e.g., UTC+8). Replaced with `Intl.DateTimeFormat.formatToParts` for reliable conversion.
- **Undo finalization (unfinalize)** — Owner can now reverse a finalization from the history list. Deletes the snapshot, restores the previous reset date, and recalculates points from the earlier period. Only the most recent snapshot per period can be undone (must undo in reverse order).
- **Multi-column finalized results modal** — Adapts layout based on player count: 1 column (≤10), 2 columns (11–25), 3 columns (26+). Compact entries for easy screenshot sharing.
- **Copy/share includes date range** — Copy, FB, and X share buttons now include the actual date range (e.g., "Weekly Results (Jun 8 → Jun 21)") instead of just "Weekly Results". Also fixed period label showing "All Time" for guild-specific snapshots (period format is `weekly:GUILD`, not `weekly`).
- **Removed 20-player limit from copy/share** — Previously only copied the first 20 players.
- **Audit log shows dates for leaderboard actions** — Both finalize and unfinalize audit entries now include `from` and `to` dates. AdminPanel audit rendering also includes dates for leaderboard resets. Unfinalize actions are distinguished as "Undo finalization" vs "Finalized".
- **Snapshot period start fixes** — Fixed fallback logic for snapshots with missing or epoch `period_start`. Modal now searches for the previous snapshot's `finalized_at` to show consistent date ranges matching the history list.
- **"Ranks" renamed to "Leaderboard"** in sidebar and mobile bottom nav.

## 🐛 Bug Fixes

- **DKP Mark for Bid search only showed user-created items** — Search now uses the same `or(game, server_id)` query pattern as Inventory's distribute modal, including game-catalog items.
- **DKP live auction empty after marking item** — `getActiveAuctions` now queries items directly (`is_up_for_bid=true AND bid_end_time > now()`) instead of relying on `get_active_bids` which only returned items with bids. Items with zero bids now appear.
- **DKP item queries restricted by RLS** — `dkp_bids` RLS only allowed members to see their own bids. `getActiveAuctions` now uses the SECURITY DEFINER `get_active_bids` RPC for bid aggregates, bypassing RLS.
- **DKP Mark for Bid build error** — esbuild couldn't parse IIFE `(()=>{...})()` inside a JSX ternary. Extracted `ItemResult` component.
- **Rarity colors on DKP items** — Item icons and names in Mark for Bid dropdown, selected item display, Live Auction rows, and Bid modal all use the item's rarity color (Common=gray, Uncommon=green, Rare=blue, Epic=purple, Legendary=amber, Mythic=red).
- **Leaderboard finalize timezone fix** — `formatToParts` replaced broken manual offset calculation.

## 🎨 DKP System (continued)

- **Live countdown timer** — Each auction row shows a ticking `d:hh:mm:ss` countdown via `useCountdown` hook, updating every second. Days only shown when > 0.
- **Bids modal** — Clicking the bid count on an auction row opens a modal showing all bids (sorted newest first) with member name, timestamp, amount, and status badge (Active=amber, Won=green, Refunded=gray).
- **Error toasts** — All DKP actions (mark, bid, resolve) now show error toasts on failure in addition to the inline modal error text.

## 🗄️ Database

- **Migration 104** — `leaderboard_snapshots` lacked a DELETE RLS policy, preventing unfinalize from working. Added policy + `delete_leaderboard_snapshot` SECURITY DEFINER RPC for safe deletion with reset date restoration.



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
- **Logout modal behind PayPal buttons** — `ConfirmDialog` used `z-50`, but PayPal's hosted card field iframes rendered above it, causing the sign-out confirmation to appear behind the payment form on the Billing page. Bumped to `z-[200]`.

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
