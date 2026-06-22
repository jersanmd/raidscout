# DKP / Loot Bidding System — Implementation Plan

## Overview

A dual-currency system where members earn **DKP** (Dragon Kill Points) from boss kills and activities — separate from leaderboard points. DKP can be spent on items via bidding or loot council. Leaderboard rankings are unaffected by DKP spending.

---

## Phase 1 — Database Schema

### 1.1 `dkp_transactions` table

```sql
CREATE TABLE public.dkp_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  guild_id UUID REFERENCES public.guilds(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL,          -- positive = earn, negative = spend
  type TEXT NOT NULL,                -- 'earn_kill', 'earn_activity', 'earn_adjustment', 'spend_bid', 'spend_fixed', 'spend_council'
  reason TEXT,                       -- e.g. "Won bid on Venatus Sword", "Boss kill: Ancient Dragon"
  reference_id UUID,                 -- polymorphic: death_record_id, activity_instance_id, bid_id, etc.
  reference_type TEXT,               -- 'death_record', 'activity_instance', 'bid', 'manual'
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_dkp_txns_server ON dkp_transactions(server_id, created_at DESC);
CREATE INDEX idx_dkp_txns_member ON dkp_transactions(member_id, created_at DESC);
CREATE INDEX idx_dkp_txns_guild ON dkp_transactions(guild_id);
```

### 1.2 `dkp_balances` materialized or live view

```sql
-- Per-member DKP balance (computed from transactions)
-- Could be a VIEW or a cached column on members table
CREATE VIEW public.dkp_balances AS
SELECT 
  member_id,
  server_id,
  COALESCE(SUM(amount), 0) AS balance
FROM public.dkp_transactions
GROUP BY member_id, server_id;
```

### 1.3 `dkp_bids` table

```sql
CREATE TABLE public.dkp_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  bid_amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',   -- 'active', 'won', 'lost', 'cancelled'
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_dkp_bids_item ON dkp_bids(item_id, status);
CREATE INDEX idx_dkp_bids_member ON dkp_bids(member_id);
```

### 1.4 `dkp_config` per-server settings

```sql
CREATE TABLE public.dkp_config (
  server_id UUID PRIMARY KEY REFERENCES public.servers(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT false,
  earn_mode TEXT DEFAULT 'per_kill',       -- 'per_kill', 'per_point', 'per_attendee'
  dkp_per_kill INTEGER DEFAULT 10,         -- DKP awarded per boss kill
  dkp_per_activity INTEGER DEFAULT 5,      -- DKP awarded per activity
  bid_mode TEXT DEFAULT 'silent',           -- 'silent', 'open', 'fixed', 'council'
  bid_duration_minutes INTEGER DEFAULT 30, -- how long bids stay open
  decay_enabled BOOLEAN DEFAULT false,
  decay_percent INTEGER DEFAULT 10,        -- % decay per period
  decay_period TEXT DEFAULT 'monthly',     -- 'weekly', 'monthly'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

## Phase 2 — Backend (Edge Functions + RPCs)

### 2.1 DKP Earning

| RPC / Function | Purpose |
|---------------|---------|
| `award_dkp_on_kill(p_death_record_id)` | Auto-award DKP to all attendees of a kill. Called from `useRecordDeath` after attendance is recorded. |
| `award_dkp_on_activity(p_activity_instance_id)` | Auto-award DKP to activity participants. |
| `adjust_member_dkp(p_member_id, p_server_id, p_amount, p_reason)` | Manual DKP adjustment (moderator/owner). Same pattern as `adjust_member_points`. |

### 2.2 DKP Bidding

| RPC / Function | Purpose |
|---------------|---------|
| `place_bid(p_item_id, p_member_id, p_amount)` | Place a bid. Validates: bid mode, DKP balance, item availability. |
| `resolve_bid(p_bid_id, p_action)` | Officer resolves: 'award' (winner gets item, DKP deducted) or 'cancel'. |
| `cancel_bid(p_bid_id)` | Bidder cancels their own bid. |

### 2.3 DKP Queries

| RPC / Function | Purpose |
|---------------|---------|
| `get_member_dkp(p_member_id, p_server_id)` | Returns current DKP balance + recent transaction history. |
| `get_guild_dkp_leaderboard(p_server_id, p_guild_id)` | Top DKP holders in a guild. |
| `get_dkp_transactions(p_server_id, p_member_id?)` | Audit trail. |

### 2.4 Edge Function

| Function | Purpose |
|----------|---------|
| `dkp-decay` | Cron-triggered (or called manually). Applies decay % to all DKP balances. Creates negative `dkp_transactions` rows. |

---

## Phase 3 — Frontend

### 3.1 New Page: `/dkp`

A new tab in the main navigation (between Leaderboard and Members).

**Layout:**
- **DKP Balance Card** — Current balance, lifetime earned, lifetime spent
- **Transaction History** — Same pattern as point adjustment history in Leaderboard
- **Active Bids** — Items the member is currently bidding on
- **Guild DKP Rankings** — Top DKP holders per guild (similar to leaderboard mini-view)

### 3.2 Inventory Integration

Modify `InventoryView`:
- Items can be marked "Up for Bid" by officers
- Bid button appears on bid-eligible items
- Bid modal: enter amount, see current highest (if open bid mode)
- Bid confirmation with DKP balance check

### 3.3 Server Settings Integration

New tab in ServerSettingsView: **DKP Settings**
- Enable/disable DKP
- DKP earn rates (per kill, per activity)
- Bid mode selector (silent/open/fixed/council)
- Bid duration
- Decay settings

### 3.4 Discord Bot Commands

| Command | Description |
|---------|-------------|
| `!dkp` | Check your DKP balance |
| `!dkp top` | Top DKP holders in your guild |
| `!bid [item] [amount]` | Place a bid on an item |
| `!loot [item] [member]` | Loot council: assign item to member |

---

## Phase 4 — Audit & Permissions

### 4.1 Audit Log Entries

New `AuditAction` entries:
- `DKP_EARN_KILL` — Auto-award from boss kill
- `DKP_EARN_ACTIVITY` — Auto-award from activity
- `DKP_ADJUST` — Manual adjustment
- `DKP_BID_PLACED` — Member placed bid
- `DKP_BID_WON` — Bid resolved as won
- `DKP_BID_LOST` — Bid resolved as lost
- `DKP_DECAY` — Decay applied

### 4.2 Moderator Permissions

New permission: `can_manage_dkp` — Controls who can adjust DKP, resolve bids, configure settings.

---

## Phase 5 — Edge Cases & Polish

- **Negative DKP**: Should we allow it? (Some guilds do — "DKP debt")
- **Bid sniping**: Minimum bid increment? Anti-snipe extension?
- **Item already distributed**: What if item is distributed manually while bid is active?
- **DKP on refund**: If a distributed item is returned, refund DKP?
- **Multi-guild servers**: DKP is per-guild. Members in multiple guilds have separate balances.
- **Viewer mode**: Viewers can see DKP rankings but not bid.

---

## Estimated Effort

| Phase | Components | Estimate |
|-------|-----------|----------|
| 1 — Schema | 4 tables, indexes, views | 1 day |
| 2 — Backend | 8 RPCs, 1 edge function | 2-3 days |
| 3 — Frontend | 1 new page, 2 integrations, 3 bot commands | 3-4 days |
| 4 — Audit & Perms | Audit actions, permission gates | 0.5 day |
| 5 — Polish | Edge cases, tests | 1 day |

**Total: ~8-10 days** for a complete, production-ready DKP system.
