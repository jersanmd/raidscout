# DKP / Loot Bidding System — Implementation Plan

## Overview

A dual-currency system where members earn **DKP** (Dragon Kill Points) from boss kills — separate from leaderboard points. DKP can be spent on items via private web bidding. Discord bot provides read-only DKP status. Web UI is for officers to manage items, resolve bids, and members to place blind bids.

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| DKP vs Leaderboard | **Completely separate** | Spending DKP never affects ranking |
| DKP earn rate | **Same as boss points** | If boss is worth 10 pts → 10 DKP per kill (configurable multiplier) |
| DKP scope | **Server-wide** | One DKP pool, all guilds share |
| Who marks items for bid | **Owner + moderators** | Staff-controlled |
| Bidding channel | **Web UI only** | Silent bids must be private. Discord for read-only status. |
| DKP visibility | **Discord (`!dkp`) + Web** | `!dkp` for everyone. Web DKP page for members who claim accounts. |
| DKP reservation | **Deducted on bid, refunded on loss** | Placing a bid immediately deducts DKP. If bid is lost or cancelled, DKP is refunded. Prevents bidding same DKP on multiple items. |
| Bid mode | **Silent auction** (default) | Members submit blind bids via web UI. Bid amounts are never shown to other bidders. |

---

## Phase 0 — Member Claim System (Prerequisite)

### Problem
Guild members exist as rows in the `members` table (added by officers) but have no way to log in. They need to "claim" their profile to access the web UI.

### Solution: Self-Service Claim with Approval

1. **Player signs up** with email/password on RaidScout
2. **Lands on "Join a Server" page** — shows: (a) servers they're already a member of, (b) a search input for server name or invite code, (c) list of servers they have pending/accepted/declined claims on
3. **Player enters** their in-game character name and submits a claim request
4. **Owner/moderator sees** notification badge in top bar with pending claim count
5. **Reviews and accepts/declines** from the top bar dropdown
6. **Player checks status** via "My Claims" link (or sees acceptance banner on next login)

### Schema
```sql
-- Member claim requests
CREATE TABLE public.member_claim_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_name TEXT NOT NULL,        -- in-game character name
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'accepted', 'declined'
  reviewer_id UUID REFERENCES auth.users(id),
  decline_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX idx_claim_req_unique ON member_claim_requests(server_id, user_id, requested_name) WHERE status = 'pending';
```

### RPCs
| RPC | Purpose |
|-----|---------|
| `submit_claim_request(p_server_id, p_requested_name)` | Player submits a claim. One pending request per server+user+name. |
| `get_pending_claims(p_server_id)` | Returns all pending claims for a server (owner/mod only). Used by top bar badge. |
| `get_my_claims()` | Returns the current user's claim requests across all servers + their status. |
| `review_claim_request(p_request_id, p_action, p_reason?)` | Owner/mod accepts or declines. On accept: links member row (case-insensitive + whitespace-trimmed name match), adds to server_members. |

### Flow
```
PlayerX signs up → searches server → enters "PlayerX" → submits claim
                                                            │
                              ┌─────────────────────────────┘
                              ▼
              Owner sees 🔔 badge in top bar
              Clicks → dropdown with pending claims
                 ┌────────────┴────────────┐
                 ▼                         ▼
             Accept                      Decline
                 │                         │
    Links auth account             Request rejected
    to member row                  (optional reason)
    Adds to server_members
    as 'member' (read-only)
                 │
                 ▼
    PlayerX can now: log in, view DKP,
    bid on items, check boss timers.
    Promotable to moderator by owner.
```

### Access Model
| Role | Can do |
|------|--------|
| `member` (claimed) | View boss timers, view DKP balance, bid on items, view leaderboard |
| `moderator` | Everything above + mark kills, manage attendance, resolve bids, manage members, review claims |
| `owner` | Full control including DKP settings, moderator promotion, billing |

### Player Notification
When a claim is accepted or declined:
- **On next login**: Check `get_my_claims()` for newly resolved claims. Show a dismissible banner: "Your claim for 'PlayerX' on ServerName was accepted!" or "declined — Reason: ..."
- **Top bar badge for the player**: If they have a resolved-but-unread claim, show a green check or red X indicator (not counted in the officer badge).
- **Email**: Deferred to future release.

---

## Phase 1 — Database Schema

### 1.0 RLS Policies
All new tables must have RLS policies:
- `dkp_transactions`: Members read own. Owner/mod read/write all.
- `dkp_bids`: Members read own. Owner/mod read/write all.
- `dkp_config`: Owner write. Mod read.
- `member_claim_requests`: Owner/mod read/write. User read own.

### 1.1 `dkp_transactions`

```sql
CREATE TABLE public.dkp_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,          -- positive = earn, negative = spend
  type TEXT NOT NULL,                -- 'earn_kill', 'earn_adjustment', 'earn_refund', 'spend_bid', 'spend_council'
  reason TEXT,
  reference_id UUID,
  reference_type TEXT,               -- 'death_record', 'bid', 'manual'
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_dkp_txns_server ON dkp_transactions(server_id, created_at DESC);
CREATE INDEX idx_dkp_txns_member ON dkp_transactions(member_id, created_at DESC);
```

### 1.2 `dkp_balances` view

```sql
CREATE VIEW public.dkp_balances AS
SELECT member_id, server_id, COALESCE(SUM(amount), 0) AS balance
FROM public.dkp_transactions GROUP BY member_id, server_id;
```

### 1.3 `dkp_bids`

```sql
CREATE TABLE public.dkp_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  discord_user_id TEXT,              -- Discord ID of bidder
  bid_amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',  -- 'active', 'won', 'lost', 'cancelled'
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX idx_dkp_bids_item ON dkp_bids(item_id, status);
CREATE INDEX idx_dkp_bids_member ON dkp_bids(member_id);
```

### 1.4 `dkp_config`

```sql
CREATE TABLE public.dkp_config (
  server_id UUID PRIMARY KEY REFERENCES public.servers(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT false,
  dkp_multiplier REAL DEFAULT 1.0,   -- multiply boss_points to get DKP (1.0 = same)
  bid_mode_default TEXT DEFAULT 'silent',
  bid_duration_minutes INTEGER DEFAULT 30,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 1.5 Items table extensions

```sql
ALTER TABLE public.items ADD COLUMN is_up_for_bid BOOLEAN DEFAULT false;
ALTER TABLE public.items ADD COLUMN dkp_cost INTEGER;
ALTER TABLE public.items ADD COLUMN dkp_min_bid INTEGER DEFAULT 1;
ALTER TABLE public.items ADD COLUMN bid_end_time TIMESTAMPTZ;
```

---

## Phase 2 — Backend

### 2.1 DKP Earning (RPCs)

| RPC | Purpose |
|-----|---------|
| `award_dkp_on_kill(p_death_record_id)` | Auto-award DKP to current attendees. **Idempotent**: diffs current vs previously awarded attendees via existing `dkp_transactions`. Only creates net-new earn transactions and net-removal deduction transactions. If all attendees removed, all previous DKP for this kill is deducted (net 0). |
| `adjust_member_dkp(p_member_id, p_server_id, p_amount, p_reason)` | Manual adjustment (moderator/owner). Creates a reversible audit trail. |

### 2.2 DKP Bidding (Web UI Only)

Bidding happens exclusively in the RaidScout web UI to keep bid amounts private.

| RPC | Purpose |
|-----|---------|
| `mark_item_for_bid(p_item_id, p_dkp_cost, p_duration_minutes)` | Officer puts item up for bidding. Sets `bid_end_time = now() + p_duration_minutes`. Only items from the server's game(s) are eligible. |
| `unmark_item_from_bid(p_item_id)` | Officer removes item from bidding. Refunds DKP to all active bidders. Item stays in catalog. |
| `place_bid(p_item_id, p_amount)` | Member places a blind bid. Validates item is up for bid. Immediately deducts DKP from balance. If member already has an active bid on this item, refunds old bid and places new one. |
| `cancel_bid(p_bid_id)` | Member cancels their own active bid. Refunds DKP. |
| `get_item_bids(p_item_id)` | Returns all bids for an item (officer only). Bid amounts hidden until auction ends (silent mode). |
| `resolve_auction(p_item_id, p_winner_bid_id)` | Officer picks winner. Sets winner bid to 'won' (DKP already deducted at bid time — no double-charge). Marks all other bids 'lost' (refunds their DKP). Clears item's bid flags and creates item distribution. If `p_winner_bid_id` is NULL, cancels the auction (refunds all). |

**Race condition protection**: `place_bid` uses `SELECT ... FOR UPDATE` on the item row to prevent concurrent bid conflicts. `resolve_auction` locks the item row during resolution.

### 2.3 DKP Status (Discord Bot — Read Only)

Discord bot provides status commands only. No bidding via Discord (bids are private).

**Member Matching**: Bot resolves Discord user → member via a `members.discord_user_id` column. When a Discord-linked user claims their profile, `discord_user_id` is populated. If no Discord link exists, Discord commands return "Link your Discord account first."

**New column**: `ALTER TABLE public.members ADD COLUMN discord_user_id TEXT;`

| Command | Description |
|---------|-------------|
| `!dkp` | Shows your current DKP balance |
| `!dkp top` | Top 10 DKP holders on the server |
| `!mybids` | List your active bids + their status (won/lost/pending) |
| `!bidstatus [item_name]` | Check if an item is up for bid, current bid count (not amounts) |

### 2.4 DKP Queries

| RPC | Purpose |
|-----|---------|
| `get_member_dkp(p_member_id, p_server_id)` | Balance + recent transactions |
| `get_server_dkp_rankings(p_server_id)` | Top DKP holders (server-wide) |
| `get_active_bids(p_server_id)` | All active bids for officer resolution |
| `get_member_dkp_history(p_member_id, p_server_id, p_limit, p_cursor)` | Paginated transaction history (cursor-based, 50 per page). |

---

## Phase 3 — Frontend

### 3.1 New Page: `/dkp`

New navigation tab between Leaderboard and Members.

- **My DKP Card** — Balance, earned this week, spent this week
- **Transaction History** — Same pattern as point adjustment history
- **DKP Rankings** — Server-wide top list
- **Active Bids** — Items you're bidding on + status (pending/won/lost)
- **Bid Form** — Place blind bids on items marked "Up for Bid". Shows your available DKP balance, minimum bid, and time remaining.

### 3.2 Inventory Integration

Modify `InventoryView`:
- Items marked "Up for Bid" show a gavel icon, DKP cost, and time remaining
- **Officer modal**: "Mark for Bid" — sets DKP cost and duration
- **Officer modal**: "Resolve Bids" — shows all bids (amounts hidden until resolved), pick winner. Calls `resolve_auction`.
- **Member action**: Bid button on bid-eligible items → opens bid form with DKP balance
- Winner gets item auto-distributed, DKP auto-deducted, losers refunded nothing (silent auction)

### 3.3 Top Bar — Claim Notification Badge

New button in `Layout.tsx` top bar (next to the RaidScout status button), visible to owners and moderators:

```
┌──────────────────────────────────────────────────┐
│  ☰  Bosses  Schedule  ...        🔔3  🟢 Status │
└──────────────────────────────────────────────────┘
```

- **Badge count** — Shows number of pending claim requests for the current server
- **Polling** — Queries `member_claim_requests` every 30s (or Supabase Realtime subscription)
- **Dropdown** — Click opens a compact dropdown listing pending claims:
  - Player name, requester email, date submitted
  - Accept / Decline buttons inline
  - Optional decline reason text field
- **Empty state** — Badge hidden when count is 0

### 3.4 Server Settings

New tab: **DKP Settings**
- Enable/disable DKP
- DKP multiplier (0.5x, 1x, 2x boss points)
- Default bid mode + duration
- Manual DKP adjustments per member



---

## Phase 4 — Audit & Permissions

### Audit Actions
`MEMBER_CLAIM_REQUESTED`, `MEMBER_CLAIM_ACCEPTED`, `MEMBER_CLAIM_DECLINED`, `DKP_EARN_KILL`, `DKP_ADJUST`, `DKP_BID_PLACED`, `DKP_BID_CANCELLED`, `DKP_BID_WON`, `DKP_BID_LOST`, `DKP_BID_REFUND`, `DKP_ITEM_MARKED`, `DKP_ITEM_UNMARKED`

### Moderator Permission
`can_manage_dkp` — Controls who can adjust DKP, mark items for bid, resolve bids.

---

## Phase 5 — Edge Cases

- **Bid on item that gets manually distributed**: Auto-cancel active bids, refund DKP
- **Multiple items up for bid**: Member can bid on multiple items, but each bid deducts DKP immediately. Cannot bid more than available balance across all active bids.
- **Bid exceeds balance**: Web UI rejects with "You only have X DKP"
- **DKP on refund**: If distributed item is returned, optionally refund DKP
- **Viewer mode**: Can see DKP rankings, cannot bid
- **Claim for non-existent member**: If the requested name doesn't match any member row, officer can still accept — system creates the member row on accept
- **Duplicate claim**: Unique constraint prevents same user from submitting duplicate pending claims for the same name on the same server
- **Member leaves server**: If member is removed from `members` table, their DKP balance is preserved (transactions reference member_id). On re-add, balance is restored.
- **DKP enabled mid-server**: When DKP is first enabled, all existing members start at 0 DKP. No backfill for past kills.
- **Bid on expired auction**: `place_bid` rejects. Expired active bids keep their `active` status until officer resolves. Officer can filter by `bid_end_time < now()` to find stale auctions.
- **Undo bid resolution**: `resolve_auction` can be called again on the same item to change the winner. Previous winner's DKP deduction is refunded, item distribution deleted, new winner selected.
- **Name matching**: Claim approval matches case-insensitively AND trims whitespace (" PlayerX " matches "playerx").
- **DKP on attendance edit**: `award_dkp_on_kill` is idempotent and recalculates based on current attendance. Adding a member → they earn DKP. Removing a member → their DKP is deducted (creates a negative transaction). Callers: `useRecordDeath` after kill AND `ParticipantModal` after attendance changes.
- **Bid immediately deducts DKP**: Placing a bid deducts DKP (creates `spend_bid` transaction). Losing bid refunds (creates `earn_adjustment` transaction). Cancelling bid refunds. Changing bid refunds old, deducts new.
- **Bid with insufficient DKP**: Web UI rejects if `dkp_balance - all_active_bids < bid_amount`. The DKP is already reserved for other active bids.
- **DKP for activities**: Not in v1. If activity DKP is needed later, add `award_dkp_on_activity` RPC — same pattern as kills.
- **Transaction history pagination**: Cursor-based, 50 per page via `get_member_dkp_history`.

---

## Migration Numbering

| Phase | Migration |
|-------|-----------|
| 0 — Member Claim | `098_member_claim_requests.sql` (table + `discord_user_id` on members) |
| 1 — DKP Schema | `099_dkp_schema.sql` (transactions, bids, config, items extensions, views, RLS) |

## Test Strategy

| File | What it tests |
|------|--------------|
| `src/lib/api/dkp.test.ts` | `award_dkp_on_kill`, `adjust_member_dkp`, `place_bid`, `resolve_bid` |
| `src/components/DkpBidForm.test.tsx` | Bid form validation, balance display, DKP check |
| `src/components/ClaimBadge.test.tsx` | Badge count rendering, dropdown interactions, accept/decline |
| `scripts/bot/commands.dkp.test.ts` | `!dkp`, `!dkp top`, `!mybids`, `!bidstatus` output |
| `src/lib/integrity.test.ts` | Add new files to silent-catch and import checks |

---

## Estimated Effort

| Phase | Components | Days |
|-------|-----------|------|
| 0 — Member Claim | 1 migration, 4 RPCs, signup flow, "Join Server" page, top bar claim badge | 2 |
| 1 — Schema | 4 tables, 1 view, item extensions | 1 |
| 2 — Backend | 11 RPCs, 4 bot commands | 2-3 |
| 3 — Frontend | 1 new page, 1 top bar badge, 2 integrations, 1 settings tab, claim notification banner | 4-5 |
| 4 — Audit | 12 audit actions, 1 permission | 0.5 |
| 5 — Polish | Edge cases, RLS, tests | 1 |

**Total: ~9-11 days**
