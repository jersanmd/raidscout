# DKP / Loot Bidding System — Implementation Plan

## Overview

A dual-currency system where members earn **DKP** (Dragon Kill Points) from boss kills — separate from leaderboard points. DKP can be spent on items via Discord bot bidding. Web UI is for officers to manage items, resolve bids, and view DKP data.

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| DKP vs Leaderboard | **Completely separate** | Spending DKP never affects ranking |
| DKP earn rate | **Same as boss points** | If boss is worth 10 pts → 10 DKP per kill (configurable multiplier) |
| DKP scope | **Server-wide** | One DKP pool, all guilds share |
| Who marks items for bid | **Owner + moderators** | Staff-controlled |
| Bidding channel | **Web UI only** | Silent bids must be private. Discord for read-only status. |
| DKP visibility | **Discord (`!dkp`) + Web** | `!dkp` for everyone. Web DKP page for members who claim accounts. |
| Bid mode | **Silent auction** (default) | Members submit blind bids via Discord. Configurable per item. |

---

## Phase 0 — Member Claim System (Prerequisite)

### Problem
Guild members exist as rows in the `members` table (added by officers) but have no way to log in. They need to "claim" their profile to access the web UI.

### Solution
1. Officer adds a member → they get an invite link with a `claim_token`
2. Member signs up with email → `claim_token` links their auth account to the member row
3. Member can now log in, view DKP on web, check boss timers

### Schema
```sql
ALTER TABLE public.members ADD COLUMN claim_token UUID DEFAULT gen_random_uuid();
ALTER TABLE public.members ADD COLUMN claimed_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION claim_member_profile(p_claim_token UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_member_id UUID;
BEGIN
  UPDATE public.members SET user_id = auth.uid(), claimed_at = now()
  WHERE claim_token = p_claim_token AND user_id IS NULL
  RETURNING id INTO v_member_id;
  RETURN v_member_id;
END; $$;
```

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

---

## Phase 4 — Audit & Permissions

### Audit Actions
`DKP_EARN_KILL`, `DKP_ADJUST`, `DKP_BID_PLACED`, `DKP_BID_WON`, `DKP_BID_LOST`, `DKP_ITEM_MARKED`

### Moderator Permission
`can_manage_dkp` — Controls who can adjust DKP, mark items for bid, resolve bids.

---

## Phase 5 — Edge Cases

- **Bid on item that gets manually distributed**: Auto-cancel active bids
- **Multiple bids from same member**: Only highest bid counts
- **Bid exceeds balance**: Bot rejects with "You only have X DKP"
- **DKP on refund**: If distributed item is returned, optionally refund DKP
- **Viewer mode**: Can see DKP rankings, cannot bid

---

## Estimated Effort

| Phase | Components | Days |
|-------|-----------|------|
| 0 — Member Claim | 1 migration, 1 RPC, signup flow integration | 1 |
| 1 — Schema | 4 tables, 1 view, item extensions | 1 |
| 2 — Backend | 7 RPCs, 4 bot commands | 2-3 |
| 3 — Frontend | 1 new page, 2 integrations, 1 settings tab | 3-4 |
| 4 — Audit | 6 audit actions, 1 permission | 0.5 |
| 5 — Polish | Edge cases, tests | 1 |

**Total: ~8-10 days**
