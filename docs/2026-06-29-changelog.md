# June 29–30, 2026 — Changelog (v0.15.12)

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

## 🎮 Multi-Game Server Picker

- **Game-aware ServerContext** — Added `game` field to `Server` interface and all fetch paths (admin, non-admin, viewer)
- **Standalone picker screen** — Full-screen server selector before summary content renders
- **Per-server toggles** — Checkbox UI to include/exclude individual servers, grouped by game with game icons
- **Per-game toggle** — "Select all / Deselect all" quick toggle for each game group
- **URL persistence** — Selected servers persisted via `?exclude=` param
- **Reconfigure badge** — `⚙ X of Y servers` pill on summary page to reopen picker
- **Summary button** — Now available with ≥1 owned/moderated server (was ≥2)
- **Obvious "Back" button** with label in the picker

## 🔧 Fixes

- **Gear data RLS bypass** — `get_member_gear_summary` SECURITY DEFINER RPC deployed to production
- **Inventory History — day-based fetching** — Replaced cursor/limit pagination with `fetchDistributionsByDay`. Initial load fetches backward day-by-day until 10 items collected (max 90 days). Scroll loads previous days, skips empty days up to 30 before stopping.
- **Inventory History — item leak** — `fetchItems` was using `.or()` returning items from all servers sharing a game. Fixed to `server_id = sid OR (game = slug AND server_id IS NULL)` for proper game-scoped items.
- **Inventory History — infinite scroll fix** — Sentinel IntersectionObserver now reconnects on loading state changes, fixing stuck scroll after load-more completes.
- **sync-staging FK ordering** — Tables reordered FK-safe (parents before children, clear in reverse)
- **sync-staging app_settings clear** — `clearStagingTable` used `id` column filter which failed for tables without `id`. Added special case for `app_settings` (`?key=not.is.null`).
- **`guildColor()` overflow** — Fixed `Math.abs(-2147483648)` with safe modulo
- **CP histogram bar alignment** — Switched to absolute positioning to prevent flex-shrink from equalizing bar heights
- **GearTrackingTab** — Empty slots now show `+{enh}` instead of "—"

## 📁 Files Changed

- `src/pages/MembersView.tsx` — Major overhaul: Overview tab charts, URL sync, localStorage sort, clickable gear rows, guild names, multi-game picker
- `src/contexts/ServerContext.tsx` — Added `game` field to `Server` type and all fetch queries
- `src/pages/InventoryView.tsx` — Day-based history fetching, sentinel fix, removed search polling
- `src/lib/api/memberManagement.ts` — `fetchDistributionsByDay` + fixed `fetchItems` cross-server leak
- `src/lib/supabase.ts` — Export `fetchDistributionsByDay`
- `src/components/GearTrackingTab.tsx` — Enhancement level display for empty slots
- `src/lib/constants.ts` — Safe modulo fix in `guildColor()`
- `scripts/full-copy.mjs` — FK-safe table ordering, `app_settings` clear fix, added `activity_assists`
- `supabase/migrations/20260629000001_get_member_gear_summary_rpc.sql` — New RPC
