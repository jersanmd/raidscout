# June 24, 2026 — Changelog (v0.16.0)

## June 25 — Follow-up Fixes & Optimizations

### 🤖 Discord Bot Performance

- **Redundant queries eliminated** — `broadcastNotification` and `createEventThreads` no longer re-query `discord_configs`, `servers`, `boss_assists`, and `guilds` per boss. Pre-fetched data from the cron loop's global queries and RPC snapshot is passed through instead. ~297 redundant REST calls/tick eliminated (~44% reduction).
- **3 global config queries merged into 1** — Combined `discord_configs` queries (notifications, threads, commands) into a single `or=(...)` query. Also fetches `notification_prefix` and `timezone` from `servers` in the same global query.
- **Notifications and threads fire concurrently** — Boss loop collects all `broadcastNotification` and `createEventThreads` promises into an array, then fires them via `Promise.all` instead of sequential `await`. Spawn waves no longer block the loop.
- **Concurrency limiter (`batchRun`)** — Caps Discord API calls at 10 concurrent to stay well under Discord's 50/sec rate limit. Protects against rate-limit errors at scale.
- **Tick duration dropped from ~35s to ~5s** — The 3-7 AM spawn wave spike (19:00-23:00 UTC) now runs at near-baseline speed. Bot can comfortably handle 200-300 servers on a single Fly.io VM.
- **`!killed` command optimized** — Three fixes for command timeouts during raid hours: (1) `serverGuilds`, `allBossGuilds`, and `prevDeaths` queries now run in parallel via `Promise.all` instead of sequentially, (2) `broadcastNotification` is now fire-and-forget (`.catch(() => {})`) instead of blocking the response, (3) command timeout increased from 15s → 25s. Result: `!killed` dropped from 15-18s to ~3-5s under load.
- **Tick duration creep fixed** — Two root causes found and fixed: (1) Activity notifications/threads were pushed to the same promise array AFTER `batchRun` already fired, running as zombie background tasks that competed with the next tick's Supabase queries. Added a second `batchRun` after the activity loop. (2) `fetchPartyList` (3-5 DB queries) was called once per thread config per boss; moved outside the configs loop to run once per thread creation. Eliminates ~67% redundant DB queries during peak spawn windows.
- **Notification prefix bug** — The global `discord_configs` query was missing `notification_prefix` in the select. Per-config role overrides were silently dropped, causing all notifications to fall back to the server-level prefix (or `@everyone` if configured). Added `notification_prefix` to the select.
- **`bot_server_snapshot` RPC index** — Added partial index `(server_id, boss_id, death_time DESC) WHERE is_initial_spawn IS NOT TRUE` on `death_records`. The existing index on `(server_id, death_time DESC)` didn't match the `ORDER BY boss_id, death_time DESC`, forcing Postgres to sort 18K+ rows per server per tick. New index enables index-only scan with no sorting.
- **`create-progress-thread` edge function redeployed** — Both staging and production now have the latest exclusion logic so toggling off Discord servers in the Demand CP modal actually skips them.

- **Fetch timeouts added** — Both `fetchWithRetry` (Supabase) and `discordFetch` (Discord) now use `AbortController` with timeouts: 30s Supabase, 20s Discord. Previously, Node.js `fetch` had no default timeout — a hung request would block the entire tick indefinitely. Now aborted requests retry 3× with exponential backoff, preventing 33+ minute silent periods.
- **Adaptive tick interval** — Replaced fixed `setInterval` with recursive `setTimeout` that adjusts interval based on rolling average of last 60 tick durations. < 5s avg → 30s, 5-10s → 60s, 10-20s → 90s, > 20s → 120s. Slows down under load to reduce Supabase strain, speeds back up when conditions improve. Live interval visible in Admin Panel (Spawn Cron card) and bot status popup. Both staging and production use adaptive intervals.

### 🎨 Frontend

- **Onboarding checklist for new servers** — Staff (owner/moderator) see a 4-step animated checklist after creating a server: (1) Add raid members → `/members`, (2) Link Discord bot → `/server-settings?tab=integrations` with YouTube guide, (3) Record first boss kill — copies `!killed BossName`, (4) Explore DKP system → `/dkp` with YouTube guide. Each item auto-checks from live data. Entrance animation (slide+fade+scale), progress bar, check-bounce on completion, shimmer celebration when all done. Dismissible with cross-component sync (module-level state). Hides the old `DiscordWebhookBanner` and `NoMembersBanner` while showing, restores them on dismiss.
- **Mythic rarity color in Gear Tracking** — `GearTrackingTab` was missing `mythic` from both `RARITY_COLORS` and `RARITY_SCORE`. Added with red (`#ef4444`) and score 20.
- **Boss Card edit spawn time uses server timezone** — Changed from browser-local `new Date()` to `Date.UTC()` with timezone offset, matching the bot's `!editkilltime` logic. Pre-fill also uses server timezone via `Intl.DateTimeFormat`.
- **Auction progress bar reversed** — Changed from 0→100 (elapsed) to 100→0 (remaining), making it a countdown bar. Green→amber→red→gray color transition.
- **Leaderboard Finalized Results vertical flow** — Rankings now flow top-to-bottom in columns (newspaper-style) instead of left-to-right (row-wise). Uses `grid-auto-flow: column` with computed row count so #1→#2→#3 fill the first column before wrapping to the next. Much easier to scan rankings in order.
- **Shareable Boss Card** — Every boss card now has a Share button below the image. Generates a 600×340 styled PNG with boss name, status, spawn time, guild owner, progress bar, and RaidScout branding. One-click copies to clipboard — paste directly into Discord. Uses `html-to-image` for rendering, includes a toast ("Paste anywhere with Ctrl+V").
- **DKP Auction Theater** — Live auctions now have a 🎭 button that opens a full-screen view. Shows item image with rarity glow, countdown timer (color transitions green→amber→red→gray), top bidders side-by-side, bid history, "Ended" state with pulse animation. New bids slide in with animation. Strict `auction_id` matching prevents cross-contamination between auction rounds. Refetches every 1s with zero cache.

### 📚 Documentation

- **README DKP section** — Added full 🏦 DKP Auction System section covering mark-for-bid, live panel, bid modal, outbid notifications, auto-resolve, history, ledger, settings, and reset.
- **Changelog restructured** — Production DB fixes and frontend changes organized into clear sections.

---

## 🔧 Production Database Fixes (June 24 afternoon)

- **Server game column backfill (177)** — 30 servers had `game = NULL` but `game_id` set, breaking the Mark Item for Bid modal's catalog search. Backfilled `game` from `games.slug`.
- **`dkp_auctions` RLS disabled (178)** — RLS was accidentally enabled on `dkp_auctions` with no policies, blocking `getActiveAuctions()` from reading live auctions. Now matches staging (RLS disabled).
- **`delete_auction_round` fixed (179, 181, 182)** — Three fixes: (1) added `DELETE FROM dkp_auctions` so deleted items actually disappear from history, (2) reverted to `ANY(arr)` pattern to avoid RLS subquery issues with `dkp_bids`, (3) added orphaned auction cleanup for auctions with zero bids.
- **`dkp_distributed` RLS disabled (182)** — Was enabled with no policies on production, silently blocking queries. Now disabled.
- **Bid notifications restored (183)** — `place_bid` was redeployed by migration 175 without outbid notification inserts. Restored `dkp_outbid` notifications with `image_url`, `auction_id`, `new_bid_amount` in metadata.
- **Resolve notifications restored (184)** — `resolve_auction` was also wiped by 175. Restored `dkp_won` and `dkp_lost` notifications for winners and losers.
- **`get_resolved_bids` auth removed (185)** — Explicit `server_members` check was causing "Not authorized" errors. Removed (SECURITY DEFINER already handles access).
- **Server creation game column restored (186)** — Migration 172 accidentally removed `game` from the `INSERT INTO servers` in `create_server_with_bosses`. Restored with `games.slug` subquery. Backfilled the 2 affected servers.

## 🎨 Frontend Fixes

- **Delete auction confirmation modal** — Replaced browser `confirm()` with a custom modal requiring the user to type the item name. Red-themed with consequences listed (bids, transactions, distribution records, auction removed).
- **DKP settings icon grayscale** — Coins icon changed from amber to neutral gray, matching other settings icons.
- **Attendance 409 Conflict fix** — Changed `addAttendance` from `.insert()` to `.upsert({ onConflict: "death_record_id,member_id" })` to handle duplicate participants gracefully.
- **Toast destructure fix** — Fixed `const toast = useToast()` → `const { toast } = useToast()` in ClaimNotificationBadge.
- **Auction progress bar based on actual duration** — Replaced fixed 24h window with `(1 − remaining / total) × 100` where total = `bid_end_time − created_at`. Falls back to 24h for legacy auctions.

## 📹 Landing Page

- **DKP video guide added** — Third video in the guides carousel: "RaidScout DKP Guide: Complete Setup, Character Claims & Loot Auctions" (`cjAEQ6Icbm0`).

---

## 🏦 DKP Auction System

- **Complete DKP auction system** — Guilds can now run DKP (Dragon Kill Points) bidding. Staff mark items for bid with configurable DKP cost, duration, quantity, and optional guild restrictions. Members place bids using their earned DKP. Highest bidder wins when the auction ends.
- **Concurrent same-item auctions** — The `dkp_auctions` table separates the auction concept from items. The same item can be auctioned multiple times simultaneously with different quantities, costs, and end times. Each auction is independent.
- **Live Auction panel** — Active auctions with countdown timers, current highest bid, bid count, guild badge, and rarity-colored item display. Click to view all bids filtered per-auction.
- **Bid modal** — Preset bid increments (+1 DKP above current highest), manual input, balance display with over-budget warning. Button disabled after auction ends.
- **Soft-close extension** — Bids placed in the final 3 minutes extend the auction by 3 minutes to prevent last-second sniping.
- **Outbid refunds** — When outbid, the previous highest bidder is automatically refunded and receives a notification.
- **Auto-resolve via Discord bot** — The staging bot automatically resolves expired auctions by picking the highest bidder as winner. Losers are refunded.
- **Resolve/Cancel modal** — Staff can manually pick a winner or cancel the auction (refunds all bidders).
- **Auction History** — Past auctions grouped by date (Today, Yesterday, This Week, Older) with winner name, winning bid, bid count, guild badge, distributed status, and time range. Load More pagination (30 per page).
- **Member DKP History** — Transaction log with boss name, death time, guild, item name, and rarity for both kill earnings and bid spendings.
- **DKP Ledger** — Current balance, total earned/spent, and leaderboard rankings per guild. Point adjustments by staff with audit logging.
- **DKP Settings** — Enable/disable DKP per server, configure multiplier, default bid duration, and hide leaderboard from players.
- **Guild-restricted auctions** — Optional guild filter on auctions. Only members of the specified guild can bid. Guild badge displayed on the auction row.
- **Distributed tracking** — Staff can mark past auctions as distributed via toggle button. Green checkmark appears in history.
- **Hide from players** — `hide_from_players` config hides the DKP leaderboard from non-staff members while keeping auctions visible.

## 🔓 Member Unlink

- **Unlink claimed members** — Staff can undo a wrong claim acceptance from the Members list. A confirmation modal requires typing the member name. Clears `members.user_id`, removes the user from `server_members`, sends a notification to the unlinked user, and marks the claim as declined.
- **Unlink notification** — Unlinked users receive a `🔓 Member unlinked` notification. Clicking it navigates to `/join` where they can see the unlink notice and submit a new claim.
- **NoServerView / JoinServerView unlink banner** — Amber banner explains what happened and directs the user to reclaim their profile.
- **Claims popup pagination** — Load More button (10 per page) instead of fixed-height scroll.
- **Realtime claims** — `member_claim_requests` added to Realtime publication for instant notification when new claims are submitted.

## 🐛 Bug Fixes

- **auto_resolve_auction cancelled all auctions** — Migration 140 changed auto-resolve to call `resolve_auction(id, NULL)`, which cancels instead of picking the highest bidder. Fixed in migration 152 to find and pass the winner bid.
- **auto_resolve_auction resolved ALL active auctions** — Previously resolved every active auction for an item regardless of `bid_end_time`. Fixed to only resolve expired auctions.
- **Auction history consolidated same-name items** — Now queries `dkp_auctions` directly instead of items, grouping by `auction_id`. Each auction appears separately.
- **Bids modal consolidated bids across auctions** — Now filters by `auction_id` when viewing bids from a specific auction row or history entry.
- **get_item_bids 400 error** — Reverted to simple SQL version. Auth check was redundant (frontend already guards access).
- **mark_item_for_bid server_id NULL** — Game-level catalog items have NULL `server_id`. Now passes `server_id` from the frontend as fallback.
- **Timezone-aware auction end times** — `serverLocalToUTC()` helper converts the `datetime-local` input (server timezone) to proper UTC before storing. Fixes time drift when staff browser timezone differs from server timezone.
- **Analytics tooltip off-screen on rightmost point** — Right-edge trigger now at 40% with `translateX(-100% + 16px)` to slide tooltip fully left.
- **get_active_bids missing auth check** — Added `server_members` membership check (parity with `get_item_bids` and `get_resolved_bids`).
- **resolve_auction winner bid validation** — Now verifies `p_winner_bid_id` belongs to `p_auction_id` before marking as won.
- **get_resolved_bids missing auction_id** — Added `auction_id` column for per-auction grouping in history.

## 🎨 UI

- **DKP page header restyled** — Coins icon now white with bordered container, matching Leaderboard header style.
- **Sidebar nav reorder** — DKP moved from Management to Assets (under Inventory).
- **Server Settings tab reorder** — DKP tab moved under Guilds.

## 🤖 Discord Bot

- **`!bidstatus` supports multiple concurrent auctions** — When multiple auctions exist for the same item, shows a compact list with per-auction quantity, cost, and time remaining.
- **Bot auto-resolve queries `dkp_auctions`** — Updated from `items?is_up_for_bid=eq.true` to `dkp_auctions?status=eq.active`.
- **Staging bot target** — Bot deploys use `fly.staging.toml` for testing (`raidscout-staging`).

## 📢 DKP Real-time Notifications & Toasts

- **Outbid toast banner** — When someone outbids you, a bounce-animated toast appears in the bottom-right corner. Shows the current bid amount and item name in rarity color. "Your DKP has been refunded. Tap to bid again." Auto-dismisses after 8 seconds.
- **Won auction toast banner** — Emerald-styled toast when you win an auction. 🏆 "You won [Item] for X DKP." Tap to view the item.
- **Stacked toasts** — Multiple simultaneous notifications stack vertically. Newest on top, older ones shift down. Each independently dismissible.
- **Tap to navigate & highlight** — Clicking a toast navigates to `/dkp` and scrolls to the highlighted auction row with an amber glow + ring + pulse animation that fades after 4 seconds.
- **Mark read on interaction** — Clicking a toast, its ×, or auto-dismiss all mark the notification as read, updating the bell badge count.
- **Realtime notifications table** — `notifications` table added to `supabase_realtime` publication with `REPLICA IDENTITY FULL` for instant push delivery.
- **"Finalizing..." badge animation** — Replaced static badge with spinning Loader2 + amber pulse animation on ended auctions.

## 🔔 Notification Bell Improvements

- **Mark all read on open** — Clicking the bell icon now calls `markAllRead()` immediately, clearing the red badge without clicking each item.
- **DKP notification navigation** — Clicking a DKP notification in the dropdown navigates to `/dkp`. Member unlink notification navigates to `/join`.

## 🔄 DKP Leaderboard Reset

- **Reset DKP button** — Red "Reset" button in the Leaderboard header (staff-only). Opens a confirmation modal requiring the user to type "confirm".
- **Per-guild reset** — Guild checklist in the reset modal with member counts. Only selected guilds are reset; unchecked guilds keep their points. "Select all" / "Clear all" buttons.
- **Preserves history** — Reset inserts negative adjustments to zero out balances instead of deleting transactions. DKP history, auction history, and bid history remain intact.
- **Detailed audit log** — Reset writes `LEADERBOARD_RESET` or `LEADERBOARD_RESET_GUILD` audit entries with per-guild member counts and total DKP wiped.
- **Help tooltip (?)** — Question mark button explains how DKP points are earned (boss kills), adjusted (staff), and spent (bids).

## 🎨 UI Polish

- **Leaderboard header restacked** — Search, guild dropdown, reset button, and help icon on their own line below the "Leaderboard" label. Search input fills available space.
- **DKP not-enabled screen improved** — Staff see instructions + link to DKP Settings. Non-staff see a message directing them to contact server owner.
- **Notification body phrasing** — All em dashes replaced with periods. Outbid body emphasizes current bid first: "The current bid on [Item] is now X DKP."

## 🗄️ Database

- **Migration 155**: `reset_all_dkp` RPC — accepts optional `p_guild_names TEXT[]` for per-guild filtering
- **Migration 156**: Added guild filter parameter to `reset_all_dkp`
- **Migration 157**: Fixed `guild_id` → `dkp_guild_id` in items table reference
- **Migration 158**: Rewrote `reset_all_dkp` to preserve history via adjustments
- **Migration 159**: Added `notifications` table to Realtime publication
- **Migration 160**: Improved outbid notification body to show new bid amount
- **Migration 161**: Rephrased outbid notification to emphasize current bid
- **Migration 162**: Replaced em dash with period in outbid notification
- **Migration 163**: Replaced em dash in `dkp_lost` notification title
- **Migration 164**: Added `item_name` and `rarity` to notification metadata for colored toast rendering

## 📦 Auction Distribute Modal

- **Distribute modal from auction history** — Clicking "Distribute" on a past auction opens a confirmation modal pre-filled with the auction winner as recipient, quantity 1, and reason "Auction won — [Item] — [Bid] DKP". All fields are read-only for review before confirming.
- **Integrated with Inventory distributions** — Distributing via DKP creates a full `distributions` record (same flow as Inventory), writes an audit log, and marks the auction as distributed.
- **Irreversible distribution** — Once distributed, the "Distribute" button disappears. A "✓ Distributed" label appears in the auction details line. To undo, delete the distribution in Inventory → History (also clears the `dkp_distributed` flag via `clear_item_distributed` RPC).
- **Per-auction tracking** — `dkp_distributed` now uses `(item_id, auction_round, auction_id)` as primary key. Multiple auctions of the same item are tracked independently.
- **Rarity-colored items** — Item image background and text use rarity color in the distribute modal.

## 🔔 DKP Notifications with Item Images

- **Item thumbnails in toast banners** — Outbid and won toast notifications now show the item's actual image instead of generic emoji icons. Falls back to emoji if no image URL.
- **image_url in notification metadata** — `resolve_auction` and `place_bid` RPCs now include `image_url` in notification metadata.

## 🛡️ DKP Reset — Deduction Only

- **Reset no longer touches auctions** — `reset_all_dkp` now only inserts negative adjustment transactions to zero out DKP balances. Active auctions, bid history, and item bid flags are intentionally left untouched.
- **Duplicate resolve prevention** — `resolve_auction` now checks `status = 'active'` before processing, preventing duplicate notifications from double-resolution.

## 🗄️ Database (continued)

- **Migration 165**: Added `auction_id` to `dkp_distributed` PK for per-auction tracking
- **Migration 166**: Added `image_url` to DKP notification metadata (`dkp_won`, `dkp_lost`, `dkp_outbid`)
- **Migration 167**: Added `status = 'active'` guard to `resolve_auction` to prevent duplicate notifications
- **Migration 168**: Removed auction cancellation and bid flag clearing from `reset_all_dkp`
- **Migration 169**: Added `clear_item_distributed` SECURITY DEFINER RPC for Inventory distribution deletion cleanup

## 📱 UI Polish

- **Header responsive** — Reduced gap and padding on mobile. Logo text hidden, all buttons icon-only. Fits all items on small screens.
- **Claims popup centered on mobile** — Centered below the top bar with `left-1/2 -translate-x-1/2`. Right-aligned on desktop.
- **Member profile back navigation** — Viewer mode navigates to `/`. Staff/members navigate to the previous page.
- **Button height consistency** — Pending button, Add Item, and New Collection buttons now share the same `py-2.5 rounded-xl` dimensions.
- **DKP layout** — Simple 2-column grid: left (Ledger + Leaderboard), right (Auctions). Single column on mobile.
- **Build fixes** — Fixed infinite loop in Inventory distributions effect, TypeScript `never[]` inference in `getPastAuctions`, missing outer `</div>` in DkpView.
