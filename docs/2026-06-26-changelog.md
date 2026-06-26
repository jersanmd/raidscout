# June 26, 2026 — Changelog (v0.15.9)

## 📊 Bot Status Trend Chart

- **Latest data point now renders at the chart's right edge** — The X-axis range was extending to `Date.now()` instead of the last data point's timestamp, leaving the latest tick stranded to the left. The range now ends at the data, and the last segment's line extends flat to the right edge.
- **Red "no data" indicator for pending ticks** — When no new tick has arrived yet, the extension from the last data point to "now" renders as a red dashed line with a red fill, clearly distinguishing it from known-green data.
- **X-axis labels show current time** — The rightmost label now displays the current time (in the user's timezone) instead of stopping at the last data point's time.
- **Tick metrics range adapts to bot uptime** — The popup fetches `range={uptime}h` capped at 24h, so freshly restarted bots fill the chart from boot rather than fetching a large stale window.
- **Popup no longer auto-refreshes** — The tick chart is fetched once on open. No interval, no distracting canvas redraws.
- **Canvas chart replaced with SVG** — The BotStatusIndicator trend chart was rewritten from a 220-line Canvas 2D implementation to a declarative SVG. Same visuals, 20% less code, no DPR scaling math, and naturally screen-reader accessible.

## 🤖 Discord Bot

- **Adaptive tick interval thresholds widened** — The bot now uses much more relaxed thresholds: `<15s → 30s, 15-45s → 60s, 45-75s → 90s, 75s+ → 120s` (was `<5s → 30s, 5-10s → 60s, 10-20s → 90s, 20s+ → 120s`). This reduces CPU churn under normal load and reserves fast ticks for truly light scans.
- **Bot status trend chart now shows full 24 hours** — The tick-metrics endpoint was missing `"24h"` in its range map, causing the chart to fall back to just 1 hour of data. Now shows the full day as intended.
- **Trend chart X-axis shows dates** — When the 24-hour window spans two calendar days, the first and last axis labels now include the date (e.g., "Jun 25 20:00" and "Jun 26 20:00").
- **Trend chart tooltip shows combined date + time** — Hover tooltip now displays "Jun 26 14:30:45" instead of separate time and date lines, making it clearer which day each data point belongs to.

## 🎨 UI/UX

- **Minimum font size raised to 11px** — All `text-[9px]` and `text-[10px]` classes across 41 files bumped to `text-[11px]`. Chart labels, status badges, and metadata text are now readable at standard desktop resolutions.
- **Rarity colors now come from the database** — Previously 5 components had hardcoded rarity color maps that ignored per-game rarity configurations in the admin panel. Created a shared `rarity.ts` utility so InventoryView, AuctionTheater, and GearTrackingTab all read from `item_rarities`. Admin-customized rarity colors now appear everywhere.
- **Hero tagline rewritten** — Changed from "Guild Operations Platform" to "Track Boss Spawns & Guild Rotations" with a tighter subheadline that tells visitors what the product does in 5 seconds.
- **Hero CTA now scrolls to pricing first** — The primary "Deploy Dashboard" button scrolls to the pricing section instead of jumping straight to the signup form, so users see the cost before committing their email.
- **Server switching overlay tracks real loading** — The forced 1-second timeout was replaced with `useIsFetching` from TanStack Query. The overlay only shows while queries are actually running, with a 5-second safety net.
- **Sidebar extracted into its own component** — The 110-line inline `renderSidebarNav` function was moved to `components/layout/SidebarNav.tsx`. Layout.tsx dropped from 530 to ~420 lines.
- **Global focus-visible indicator** — Refined `*:focus-visible` styles with `border-radius: inherit` so keyboard navigation shows a visible ring on all interactive elements.

## 🐛 Bug Fixes

- **BotStatusIndicator TypeScript build errors** — The `BotStatus` interface was missing `spawn_cron`, `memory_mb`, `active_commands`, and `node_version` fields that the status API actually returns. Added all four, fixing 3 TS2339 errors.
- **Trend chart uses server timezone** — X-axis labels, date labels, and hover tooltip now all respect the server's configured timezone instead of the browser's local timezone.
- **`auto_kill_test_servers` Postgres error** — Fixed SQL STATE 22P02 caused by `picked INT[]` not matching `members.id` (UUID). Changed to `picked UUID[]`.
- **Removed `@ts-nocheck` from spawn-cron.ts** — The 512-line Discord bot tick file was completely invisible to TypeScript. Removed the suppression and fixed the 2 type errors (Map/Set iteration).
- **InventoryView duplicate React imports** — Cleaned up duplicate `useState/useEffect/useMemo` import lines that were breaking the build.
