# June 24, 2026 — Changelog (v0.16.0)

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
