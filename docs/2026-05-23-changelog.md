# May 23, 2026 — Changelog

## Bug Fixes
- **Fixed-schedule bosses alive window**: `calculateFixedScheduleSpawn` now shows "alive" during spawn window even without a death record
- **Daily rotation button mismatch**: `getBossRotationInfo` now has same-day check matching `getOwnerGuildName`
- **rotation_counter idx out-of-bounds**: Added `safeMod` wrapping in all rotation idx calculations
- **Sign-out ERR_ABORTED**: Changed from `signOut({ scope: "local" })` to `signOut()` with try/catch fallback
- **Leaderboard empty after simulation**: `attendance_records` inserts were missing `server_id`
- **Daily mode indexing bug in SQL**: Fixed 0-based vs 1-based indexing causing rotation to stick
- **Schedule bosses skipped in simulation**: Added fallback rotation logic

## New Features
- **Landing page carousel**: Circular infinite loop, swipe/drag (mouse + touch), 15-second pause after interaction
- **UpcomingStrip guild badges**: Colored badges with Shield icon next to boss name
- **Leaderboard Share dropdown**: Native Share API, Facebook, X/Twitter, Copy Text
- **Discord embed branding**: "Powered by RaidScout" footer on all embed types
- **Server name duplicate check**: NoServerView and CreateServerModal check for duplicates
- **Loading spinner during server creation**: Full-screen overlay with "Seeding 39 bosses"
- **SEO foundation**: react-helmet-async, SEOHead, OG/Twitter tags, JSON-LD, robots.txt, sitemap.xml
- **Hide Discord button for viewers**: "Post 24h Spawns to Discord" hidden in viewer mode

## Architecture
- **Rotation logic extracted**: `src/lib/rotation.ts` with `getOwnerGuildName`, `getRotationInfo`, `safeMod`
- **25 unit tests** in `src/lib/rotation.test.ts`
- **Refactored BossListView**: Inline rotation logic replaced with module calls

## SQL Scripts
- 30-day simulation with proper guild rotation across all 3 modes
- Cleanup script for simulated data

## Test Status
- 43 tests across 3 files, all passing
