# June 29, 2026 — Changelog (v0.15.12)

## 📊 MembersSummaryView — Overview Tab

- **Key Metrics** — 3 merged stat cards:
  - **Members** — Total count + per-server breakdown with guild chips in compact row format, hover highlights
  - **Combat Power** — High / Avg / Low stacked
  - **30-Day Growth** — Highest & lowest individual member growth
- **CP Distribution Histogram** — Adaptive gap buckets (wider at low CP, narrower at high CP), skips empty ranges, tallest bar scaled to 100% with proportional bars, count + percentage labels
- **Class Distribution** — Horizontal bar chart sorted by count, with class name, proportional bar, count, and share %
- **Gear Completion by Slot** — Stacked rarity-colored progress bars (common→mythic) with player counts inside each segment, right-side equipped/total fraction

## 📊 MembersSummaryView — UX Improvements

- **URL sync** — Tab state and search text persisted in URL params (`tab`, `q`, `gearq`), survives refreshes
- **localStorage sort persistence** — Sort column & direction saved for both Members and Gear Tracking tabs
- **Gear Tracking rows clickable** — Navigate to member profile page on click
- **Guild name** displayed beside server name in Gear Tracking Player column
- **Sort indicators** (⇅/▲/▼) on Members and Gear Tracking columns

## 🔧 Fixes

- **Gear data RLS bypass** — `get_member_gear_summary` SECURITY DEFINER RPC deployed to staging for cross-server gear queries
- **sync-staging FK ordering** — Tables reordered FK-safe (parents before children, clear in reverse)
- **`guildColor()` overflow** — Fixed `Math.abs(-2147483648)` with safe modulo
- **CP histogram bar alignment** — Switched to absolute positioning to prevent flex-shrink from equalizing bar heights
- **GearTrackingTab** — Empty slots now show `+{enh}` instead of "—"

## 📁 Files Changed

- `src/pages/MembersView.tsx` — Major overhaul: Overview tab charts, URL sync, localStorage sort, clickable gear rows, guild names
- `src/components/GearTrackingTab.tsx` — Enhancement level display for empty slots
- `src/lib/constants.ts` — Safe modulo fix in `guildColor()`
- `scripts/full-copy.mjs` — FK-safe table ordering, added `activity_assists`
- `supabase/migrations/20260629000001_get_member_gear_summary_rpc.sql` — New RPC
