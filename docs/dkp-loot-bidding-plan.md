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
| Bid mode | **Silent auction** (default) | Members submit blind bids via web UI. Bid amounts are never shown to other bidders. |

---

## Phase 0 — Member Claim System (Prerequisite)

### Problem
Guild members exist as rows in the `members` table (added by officers) but have no way to log in. They need to "claim" their profile to access the web UI.

### Solution: Self-Service Claim with Approval

1. **Player signs up** with email/password on RaidScout
2. **Player searches** for their server (by name or invite code)
3. **Player enters** their in-game character name and submits a claim request
4. **Owner/moderator reviews** pending claims in Server Settings
5. **Accept**: Links the member row to the player's auth account. Auto-adds to `server_members` with `role = 'member'`.
6. **Decline**: Request is rejected with optional reason.

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
| `review_claim_request(p_request_id, p_action, p_reason?)` | Owner/mod accepts or declines. On accept: links member row (by name match), adds to server_members. |

### Flow
```
PlayerX signs up → searches server → enters "PlayerX" → submits claim
                                                            │
                              ┌─────────────────────────────┘
                              ▼
              Owner sees pending claim in Server Settings
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

---

## Phase 1 — Database Schema

### 1.1 `dkp_transactions`

```sql
CREATE TABLE public.dkp_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,          -- positive = earn, negative = spend
  type TEXT NOT NULL,                -- 'earn_kill', 'earn_adjustment', 'spend_bid', 'spend_council'
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
ALTER TABLE public.items ADD COLUMN bid_end_time TIMESTAMPTZ;
```

---

## Phase 2 — Backend

### 2.1 DKP Earning (RPCs)

| RPC | Purpose |
|-----|---------|
| `award_dkp_on_kill(p_death_record_id)` | Auto-award DKP to all attendees. Amount = boss_points × multiplier. |
| `adjust_member_dkp(p_member_id, p_server_id, p_amount, p_reason)` | Manual adjustment (moderator/owner). |

### 2.2 DKP Bidding (Web UI Only)

Bidding happens exclusively in the RaidScout web UI to keep bid amounts private.

| RPC | Purpose |
|-----|---------|
| `mark_item_for_bid(p_item_id, p_dkp_cost, p_duration)` | Officer puts item up for bidding |
| `place_bid(p_item_id, p_amount)` | Member places a blind bid. Validates: item is up for bid, member has enough DKP. |
| `resolve_bid(p_bid_id, p_action)` | Officer resolves: 'award' (deduct DKP, distribute item) or 'cancel' |

### 2.3 DKP Status (Discord Bot — Read Only)

Discord bot provides status commands only. No bidding via Discord (bids are private).

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
- **Officer modal**: "Resolve Bids" — shows all bids (amounts hidden until resolved), pick winner
- **Member action**: Bid button on bid-eligible items → opens bid form with DKP balance
- Winner gets item auto-distributed, DKP auto-deducted, losers refunded nothing (silent auction)

### 3.3 Server Settings

New tab: **DKP Settings**
- Enable/disable DKP
- DKP multiplier (0.5x, 1x, 2x boss points)
- Default bid mode + duration
- Manual DKP adjustments per member

New section: **Pending Claims** (in Members tab or standalone)
- Table of pending claim requests: player name, requester email, date
- Accept / Decline buttons with optional decline reason
- Audit log entries for accepted/declined claims

---

## Phase 4 — Audit & Permissions

### Audit Actions
`MEMBER_CLAIM_REQUESTED`, `MEMBER_CLAIM_ACCEPTED`, `MEMBER_CLAIM_DECLINED`, `DKP_EARN_KILL`, `DKP_ADJUST`, `DKP_BID_PLACED`, `DKP_BID_WON`, `DKP_BID_LOST`, `DKP_ITEM_MARKED`

### Moderator Permission
`can_manage_dkp` — Controls who can adjust DKP, mark items for bid, resolve bids.

---

## Phase 5 — Edge Cases

- **Bid on item that gets manually distributed**: Auto-cancel active bids
- **Multiple bids from same member**: Only highest bid counts
- **Bid exceeds balance**: Web UI rejects with "You only have X DKP"
- **DKP on refund**: If distributed item is returned, optionally refund DKP
- **Viewer mode**: Can see DKP rankings, cannot bid
- **Claim for non-existent member**: If the requested name doesn't match any member row, officer can still accept — system creates the member row on accept
- **Duplicate claim**: Unique constraint prevents same user from submitting duplicate pending claims for the same name on the same server
- **Member leaves server**: If member is removed from `members` table, their DKP balance is preserved (transactions reference member_id). On re-add, balance is restored.

---

## Estimated Effort

| Phase | Components | Days |
|-------|-----------|------|
| 0 — Member Claim | 1 migration, 2 RPCs, signup flow, claim review UI | 1-2 |
| 1 — Schema | 4 tables, 1 view, item extensions | 1 |
| 2 — Backend | 7 RPCs, 4 bot commands | 2-3 |
| 3 — Frontend | 1 new page, 2 integrations, 1 settings tab | 3-4 |
| 4 — Audit | 9 audit actions, 1 permission | 0.5 |
| 5 — Polish | Edge cases, tests | 1 |

**Total: ~8-10 days**
