# RaidScout Onboarding Plan

## Current State

New user flow today:
1. Sign up / Sign in → 2. NoServerView (pick game, create server) → 3. **Land on empty BossListView with zero guidance**

The PROJECT_REVIEW.md calls this out: *"No onboarding flow. A new user creates a server and lands on an empty boss list with no guidance."*

---

## Recommended Approach: Post-Creation Checklist + Contextual Empty States

This is the sweet spot: **~2-3 hours to implement**, no new dependencies, deeply informative.

### Phase 1: Onboarding Checklist (primary)

A dismissible checklist card that appears on BossListView immediately after server creation.

```
┌─────────────────────────────────────────────┐
│ 🚀 Welcome to RaidScout!            [✕]    │
│                                             │
│ ████████░░░░░░░░ 3 of 6 complete            │
│                                             │
│ ✅ Create your server                        │
│ ✅ Add your first guild                      │
│ ⬜ Invite your raid members    [Invite]      │
│ ⬜ Link Discord bot            [Setup]       │
│ ⬜ Record first boss kill      [!killed]     │
│ ⬜ Explore DKP loot system     [View Guide]  │
└─────────────────────────────────────────────┘
```

**How it works:**
- Appears only when `bosses.length === 0` (server just created, no kills yet)
- Checklist items auto-check based on real data:
  - ✅ Server exists (always checked if checklist shows)
  - ✅ First guild exists (`guilds.length > 0`)
  - ⬜ Members exist (`members.length > 0`)
  - ⬜ Discord linked (`discord_configs` exists for this server)
  - ⬜ First kill recorded (`death_records.length > 0`)
  - ⬜ DKP explored (localStorage flag set when user visits `/dkp`)
- Dismissed state stored in `localStorage` per server
- Collapses to a thin progress bar when partially complete

### Phase 2: Enhanced Empty States (complementary)

Current empty states are generic. Replace with actionable guidance:

| Page | Current | → New |
|------|---------|-------|
| BossListView (empty) | "Nothing to track yet" | Specific instructions: Discord `!killed` command, or link to Server Settings to add bosses |
| LeaderboardView (empty) | "No members yet" | "Invite members to start tracking attendance" + link to invite page |
| MembersView (empty) | (no empty state) | "Share your invite code" with copy button |

### Phase 3: Feature Discovery Hints (future, optional)

After checklist complete, show subtle hints on first visit to each page:
- Leaderboard: "Tip: Click 'Finalize' to save weekly results"
- DKP: "Tip: Mark items for bid in the Auction panel"
- Analytics: "Tip: Switch between Weekly and Monthly views"

---

## Implementation Plan

### New files needed:

| File | Purpose |
|------|---------|
| `src/components/OnboardingChecklist.tsx` | The checklist card component |
| `src/hooks/useOnboardingProgress.ts` | Hook to compute checklist item states |

### Files to modify:

| File | Change |
|------|--------|
| `src/pages/BossListView.tsx` | Render `<OnboardingChecklist />` when `bosses.length === 0 && !dismissed` |
| `src/components/NoServerView.tsx` | Set localStorage flag on successful server creation |
| `src/pages/LeaderboardView.tsx` | Enhanced empty state with invite link |
| `src/pages/MembersView.tsx` | Enhanced empty state with copy invite code |

### Data flow:

```
ServerContext
  ├─ bosses.length === 0  ──→  show checklist
  ├─ members.length > 0   ──→  check "Invite members"
  ├─ discordConfigs       ──→  check "Link Discord"
  ├─ deathRecords         ──→  check "First kill"
  └─ localStorage flag    ──→  check "DKP explored"

localStorage
  └─ raidscout-onboarding-dismissed-{serverId}  ──→  hide checklist
  └─ raidscout-onboarding-dkp-seen-{serverId}   ──→  check DKP step
```

### States to handle:

| State | Behavior |
|-------|----------|
| Checklist showing, 0 done | Full card, all items unchecked |
| 3 done, 3 remaining | Progress bar, remaining items with CTAs |
| All 6 done | Auto-dismiss with "🎉 All set!" toast |
| User dismisses early | Collapse to thin bar for 24h, then hide |
| Server already has kills | Never show (not a new server) |
| Viewer mode | Never show (viewers can't configure) |

### Edge cases:
- Re-dismiss: if user dismisses then creates another server, show again
- Race condition: checklist appears before `guilds` query completes → use loading state
- Discord config: check both `discord_configs` table AND webhook settings

---

## What NOT to do (over-engineering for now)

- ❌ Interactive product tour with overlays (driver.js/react-joyride) — high effort, fragile
- ❌ Multi-step wizard modal — users hate modals
- ❌ Video tutorials inline — heavy, slow to load
- ❌ Tooltip system — needs a library, complex positioning logic

---

## Estimated Effort

| Phase | Time |
|-------|------|
| `useOnboardingProgress` hook | 30 min |
| `OnboardingChecklist` component | 45 min |
| BossListView integration | 15 min |
| localStorage + auto-check logic | 30 min |
| Enhanced empty states (3 pages) | 30 min |
| Testing | 15 min |
| **Total** | **~2.5 hours** |
