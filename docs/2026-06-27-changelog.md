# June 27, 2026 — Changelog (v0.15.10)

## 💰 Paywall Gating

- **DKP gated for expired servers** — DKP is now locked behind the paywall like other Pro features:
  - **Main screen** (`/dkp`): Shows `ExpiredGate` when server access is expired, matching History, Leaderboard, Members, and Inventory.
  - **Server Settings → DKP tab**: DKP settings tab is now gated when expired, matching Bosses, Activities, and Integrations tabs.

## 🎨 UI/UX

- **Loading spinners added to Inventory tabs** — Recipients and Analytics tabs now show a spinner with descriptive text while data loads, instead of rendering empty/partial tables.
- **Gear Tracking loading state** — Members → Gear Tracking now shows a spinner while `member_gear` data loads, preventing the gear matrix from rendering with empty rows.
- **Minimum font size raised to 11px** — All `text-[9px]` and `text-[10px]` classes across 41 files bumped to `text-[11px]`. Chart labels, status badges, and metadata text are now readable at standard desktop resolutions.

## 🤖 Discord Bot

- **`@ts-nocheck` removed from spawn-cron.ts** — The 512-line tick file was completely invisible to TypeScript. Removed the suppression and fixed Map/Set iteration errors.
- **`process.env` type declaration added** — Added `declare const process` so the bot compiles without `@types/node`.
- **Unused `isStaging` variable removed** — Cleaned up a dead variable left from an earlier staging config.

## 🗄️ Database

- **`auto_kill_test_servers` type fix** — Fixed SQL STATE 22P02 caused by `picked INT[]` not matching `members.id` (UUID). Changed to `picked UUID[]`.
- **Audit log sequence fix** — Added migration to reset `admin_audit_log_id_seq` to prevent duplicate key errors when writing audit entries.
- **Fixed `fetch_moderator_permissions` RPC** — The function referenced outdated column names from an old schema. Recreated with `RETURNS SETOF` to automatically match the current table columns.

## ⚡ Performance

- **Fixed Supabase 400 errors on activity queries** — Removed duplicate `end_time` filter that PostgREST rejected with PGRST200. Affected Members, Member Profile, and Analytics pages.
- **Fixed Supabase 400 errors on spawn notifications** — Bot was sending a non-existent column in POST requests to `spawn_notifications`, causing errors on every tick.

## 🌐 SEO

- **Changelog page now has meta tags** — Added title, description, and canonical URL for better search engine indexing.

## 🏦 DKP

- **Detailed DKP distribution audit logs** — Added `DKP_ITEM_DISTRIBUTED` audit action with full metadata (auction ID, round, winning bid, winner, recipient, quantity, reason). Previously DKP distributions used the generic `ITEM_DISTRIBUTE` action with no DKP-specific context.

## 🎨 Rarity Colors

- **Rarity colors now come from the database** — Previously 5 components had hardcoded rarity color maps that ignored per-game rarity configurations. Created a shared `rarity.ts` utility so InventoryView, AuctionTheater, and GearTrackingTab all read from `item_rarities`. Admin-customized rarity colors now appear everywhere.

## 🐛 Bug Fixes

- **GearTrackingTab brace/paren mismatch** — Fixed stray closing braces and missing ternary closers in the gear matrix rendering that prevented the file from compiling.
- **InventoryView duplicate React imports** — Cleaned up duplicate `useState/useEffect/useMemo` import lines that were breaking the build.
- **InventoryView catalog tab extra closings** — Removed three spurious IIFE closing structures that were left behind from a previous edit.
- **InventoryView analytics IIFE closing** — Fixed the analytics tab closing to match its IIFE opening.
- **Weekly Schedule — spinner disappeared before attendance loaded** — On first visit, the loading overlay dismissed immediately because the "no death records → skip waiting" logic fired before boss/death record data arrived. Now waits for `bossesLoading` and `recordsLoading` to both finish before skipping the overlay.
- **Bot Status stat cards — responsive font sizing** — Removed `truncate` from Uptime, Memory, Machine, and Node.js stat card values. On small screens, font sizes now scale down to `text-[10px]` so full values display without being cut off.
